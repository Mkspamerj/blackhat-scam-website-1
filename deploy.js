const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '187.77.217.31';
const USER = 'root';
const PASS = process.env.VPS_PASS || 'RidaputitadeoverCloud726363()()';
const REMOTE_DIR = '/root/web';

// Files to upload (no node_modules, no deploy script)
const FILES_TO_UPLOAD = [
  'index.html',
  'payment.html',
  'server.js',
  'package.json',
  'Dockerfile'
];

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => { const s = d.toString(); process.stdout.write(s); out += s; });
      stream.stderr.on('data', (d) => { const s = d.toString(); process.stderr.write(s); out += s; });
      stream.on('close', (code) => resolve({ code, out }));
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    console.log(`  Uploading ${path.basename(localPath)} -> ${remotePath}`);
    const rs = fs.createReadStream(localPath);
    const ws = sftp.createWriteStream(remotePath);
    ws.on('close', resolve);
    ws.on('error', reject);
    rs.pipe(ws);
  });
}

function getSFTP(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
  });
}

async function main() {
  const conn = new Client();

  conn.on('error', (err) => {
    console.error('SSH Error:', err.message);
    process.exit(1);
  });

  conn.on('ready', async () => {
    try {
      console.log('=== Conectado al VPS ===\n');

      // 1. Create remote directory
      await exec(conn, `mkdir -p ${REMOTE_DIR}`);

      // 2. Upload files via SFTP
      console.log('\n--- Subiendo archivos ---');
      const sftp = await getSFTP(conn);
      for (const file of FILES_TO_UPLOAD) {
        const local = path.join(__dirname, file);
        if (fs.existsSync(local)) {
          await uploadFile(sftp, local, `${REMOTE_DIR}/${file}`);
        } else {
          console.log(`  [skip] ${file} not found locally`);
        }
      }
      sftp.end();
      console.log('--- Archivos subidos ---\n');

      // 3. Install Docker if not present
      console.log('--- Instalando Docker (si no existe) ---');
      await exec(conn, `
        if ! command -v docker &> /dev/null; then
          echo "Installing Docker..."
          apt-get update -y
          apt-get install -y ca-certificates curl gnupg
          install -m 0755 -d /etc/apt/keyrings
          curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
          chmod a+r /etc/apt/keyrings/docker.gpg
          echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
          apt-get update -y
          apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
          systemctl enable docker
          systemctl start docker
          echo "Docker installed!"
        else
          echo "Docker already installed"
        fi
      `);

      // 4. Stop any existing container
      console.log('\n--- Deteniendo contenedores anteriores ---');
      await exec(conn, `cd ${REMOTE_DIR} && docker compose down 2>/dev/null; docker stop ticketmaster-web 2>/dev/null; docker rm ticketmaster-web 2>/dev/null; echo "Done"`);

      // 5. Build and start with Docker Compose
      console.log('\n--- Construyendo y levantando contenedor ---');
      await exec(conn, `cd ${REMOTE_DIR} && docker compose up -d --build`);

      // 6. Verify container is running
      console.log('\n--- Verificando contenedor ---');
      await exec(conn, 'docker ps');

      // 7. Open firewall port 80
      console.log('\n--- Abriendo puertos ---');
      await exec(conn, `
        if command -v ufw &> /dev/null; then
          ufw allow 80/tcp
          ufw allow 443/tcp
          echo "Firewall ports opened"
        else
          echo "No ufw, ports should be open"
        fi
      `);

      // 8. Install and configure a temporary domain service (serveo/localhost.run alternative using caddy + duckdns or just direct IP)
      // We'll set up a simple cron job that refreshes a free subdomain every 24h
      // For now, the site is accessible via IP directly, plus we set up a tunnel
      console.log('\n--- Configurando acceso temporal con links compartibles ---');
      
      // Install cloudflared for temporary tunnels
      await exec(conn, `
        if ! command -v cloudflared &> /dev/null; then
          echo "Installing cloudflared..."
          curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
          dpkg -i /tmp/cloudflared.deb || apt-get install -f -y
          rm /tmp/cloudflared.deb
          echo "cloudflared installed!"
        else
          echo "cloudflared already installed"
        fi
      `);

      // Kill any existing tunnel
      await exec(conn, 'pkill cloudflared 2>/dev/null; sleep 1; echo "Previous tunnels stopped"');

      // Start cloudflare tunnel (generates a free temporary URL, lasts until stopped)
      // Run in background and capture the URL
      await exec(conn, `
        nohup cloudflared tunnel --url http://localhost:80 > /tmp/cloudflared.log 2>&1 &
        echo "Tunnel starting..."
        sleep 5
        cat /tmp/cloudflared.log
      `);

      // Get the tunnel URL
      const { out: tunnelLog } = await exec(conn, 'cat /tmp/cloudflared.log 2>/dev/null');

      // Set up auto-restart cron (every 24h restart tunnel for fresh URL)
      await exec(conn, `
        # Cron to restart tunnel every 24h
        (crontab -l 2>/dev/null | grep -v cloudflared; echo "0 0 * * * pkill cloudflared; sleep 2; nohup cloudflared tunnel --url http://localhost:80 > /tmp/cloudflared.log 2>&1 &") | crontab -
        echo "Cron job set for 24h tunnel refresh"
      `);

      // Extract URL from log
      const urlMatch = tunnelLog.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      
      console.log('\n\n========================================');
      console.log('   DESPLIEGUE COMPLETADO');
      console.log('========================================');
      console.log(`\n  IP directa:  http://${HOST}/`);
      if (urlMatch) {
        console.log(`  Link temporal: ${urlMatch[0]}`);
        console.log(`\n  (El link temporal se renueva cada 24h)`);
      } else {
        console.log(`\n  Esperando URL temporal... revisa con:`);
        console.log(`  ssh root@${HOST} "cat /tmp/cloudflared.log"`);
      }
      console.log('\n========================================\n');

      conn.end();
    } catch (e) {
      console.error('Error:', e);
      conn.end();
      process.exit(1);
    }
  });

  console.log(`Conectando a ${HOST}...`);
  conn.connect({
    host: HOST,
    port: 22,
    username: USER,
    password: PASS,
    readyTimeout: 30000,
    algorithms: {
      kex: [
        'curve25519-sha256',
        'curve25519-sha256@libssh.org',
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384',
        'ecdh-sha2-nistp521',
        'diffie-hellman-group-exchange-sha256',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group16-sha512',
        'diffie-hellman-group18-sha512',
        'diffie-hellman-group14-sha1'
      ]
    }
  });
}

main();
