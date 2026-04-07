const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '187.77.217.31';
const USER = 'root';
const PASS = process.env.VPS_PASS || 'RidaputitadeoverCloud726363()()';
const REMOTE_DIR = '/root/web';

const FILES = ['index.html', 'payment.html', 'server.js', 'package.json', 'Dockerfile'];

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`>>> ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => { const s = d.toString(); process.stdout.write(s); out += s; });
      stream.stderr.on('data', (d) => { const s = d.toString(); process.stderr.write(s); out += s; });
      stream.on('close', (code) => resolve({ code, out }));
    });
  });
}

function uploadFile(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    console.log(`  Upload ${path.basename(local)}`);
    const rs = fs.createReadStream(local);
    const ws = sftp.createWriteStream(remote);
    ws.on('close', resolve);
    ws.on('error', reject);
    rs.pipe(ws);
  });
}

async function main() {
  const conn = new Client();
  conn.on('error', (err) => { console.error('SSH Error:', err.message); process.exit(1); });
  conn.on('keyboard-interactive', (name, instr, instrLang, prompts, finish) => { finish([PASS]); });
  conn.on('ready', async () => {
    try {
      console.log('Conectado!\n');

      // Upload files (NOT docker-compose.yml — VPS has its own with Caddy)
      const sftp = await new Promise((res, rej) => conn.sftp((e, s) => e ? rej(e) : res(s)));
      for (const f of FILES) {
        const local = path.join(__dirname, f);
        if (fs.existsSync(local)) await uploadFile(sftp, local, `${REMOTE_DIR}/${f}`);
      }
      sftp.end();
      console.log('\nArchivos subidos.\n');

      // Download images locally so they don't depend on Discord CDN
      console.log('Descargando imágenes al VPS...\n');
      await exec(conn, `mkdir -p ${REMOTE_DIR}/img`);
      await exec(conn, `curl -sL -o ${REMOTE_DIR}/img/event.png "https://cdn.discordapp.com/attachments/1453810991631700092/1477346486466510889/7892d47e-4d88-4a93-8c2d-1f05789a4e01_EVENT_DETAIL_PAGE_16_9.png?ex=69a46da2&is=69a31c22&hm=4482bcd75ed2584fe5dc3caf10a846d6c9f3dff6b8b9b4aea7028fba592879d0" && echo "event.png OK" || echo "event.png FAIL"`);
      await exec(conn, `curl -sL -o ${REMOTE_DIR}/img/venue.png "https://cdn.discordapp.com/attachments/1453810991631700092/1477346458997887107/image.png?ex=69a46d9b&is=69a31c1b&hm=a2967e7cbe8bfdbe872ff9cac0b1bf903d8f132d43a72e4c140fa9c749f62c86" && echo "venue.png OK" || echo "venue.png FAIL"`);
      // Verify images downloaded correctly
      await exec(conn, `ls -la ${REMOTE_DIR}/img/`);

      console.log('\nReconstruyendo contenedor...\n');

      // Write docker-compose with host-level NGINX proxy (bind to 127.0.0.1:3001)
      await exec(conn, `cat > ${REMOTE_DIR}/docker-compose.yml << 'EOF'
services:
  web:
    build: .
    container_name: ticketmaster-web
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:80"
    environment:
      - PORT=80
EOF
echo "docker-compose.yml written (port 3001 -> NGINX proxy)"`);

      // Rebuild and restart
      await exec(conn, `cd ${REMOTE_DIR} && docker compose down --remove-orphans 2>/dev/null; docker compose up -d --build`);
      
      console.log('\n');
      await exec(conn, 'docker ps');

      console.log('\n=== Actualización completada ===');
      console.log('https://ticketmastercheckout.duckdns.org\n');
      conn.end();
    } catch (e) { console.error('Error:', e); conn.end(); process.exit(1); }
  });

  console.log(`Conectando a ${HOST}...`);
  conn.connect({ host: HOST, port: 22, username: USER, password: PASS, tryKeyboard: true, readyTimeout: 60000,
    algorithms: { kex: ['curve25519-sha256','curve25519-sha256@libssh.org','ecdh-sha2-nistp256','ecdh-sha2-nistp384','ecdh-sha2-nistp521','diffie-hellman-group-exchange-sha256','diffie-hellman-group14-sha256','diffie-hellman-group16-sha512','diffie-hellman-group18-sha512','diffie-hellman-group14-sha1'] }
  });
}
main();
