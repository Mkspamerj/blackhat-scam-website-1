const { Client } = require('ssh2');

const HOST = process.env.VPS_HOST || '187.77.217.31';
const USER = process.env.VPS_USER || 'root';
const PASS = process.env.VPS_PASS;
const DOMAIN = process.env.DUCKDNS_DOMAIN || 'ticketmastercheckout';
const FQDN = `${DOMAIN}.duckdns.org`;
const REMOTE_DIR = '/root/web';

if (!PASS) {
  console.error('Falta VPS_PASS en variables de entorno.');
  process.exit(1);
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => {
        const s = d.toString();
        process.stdout.write(s);
        out += s;
      });
      stream.stderr.on('data', (d) => {
        const s = d.toString();
        process.stderr.write(s);
        out += s;
      });
      stream.on('close', (code) => resolve({ code, out }));
    });
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
      console.log('=== Conectado al VPS ===');

      await exec(conn, `mkdir -p ${REMOTE_DIR}`);

      await exec(conn, `cat > ${REMOTE_DIR}/docker-compose.yml << 'EOF'\nservices:\n  web:\n    build: .\n    container_name: ticketmaster-web\n    restart: unless-stopped\n    ports:\n      - \"127.0.0.1:3001:80\"\n    environment:\n      - PORT=80\nEOF\necho "docker-compose actualizado (web en 127.0.0.1:3001)"`);

      await exec(conn, `cd ${REMOTE_DIR} && docker compose up -d --build`);

      await exec(conn, `if command -v nginx >/dev/null 2>&1; then\n  cat > /etc/nginx/conf.d/${FQDN}.conf << 'EOF'\nserver {\n    listen 80;\n    server_name ${FQDN};\n\n    location / {\n        proxy_pass http://127.0.0.1:3001;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_read_timeout 120s;\n    }\n}\nEOF\n  nginx -t && systemctl reload nginx && echo 'NGINX proxy OK';\nelse\n  echo 'NGINX no encontrado';\nfi`);

      await exec(conn, `if command -v certbot >/dev/null 2>&1 && command -v nginx >/dev/null 2>&1; then\n  certbot --nginx -d ${FQDN} --non-interactive --agree-tos --register-unsafely-without-email --redirect || true;\n  echo 'Intento HTTPS terminado';\nelse\n  echo 'certbot o nginx no disponible, se mantiene HTTP';\nfi`);

      await exec(conn, `curl -sI http://${FQDN} | head -5`);
      await exec(conn, `curl -skI https://${FQDN} | head -5 || true`);
      await exec(conn, `docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'`);

      console.log('\n=== LISTO ===');
      console.log(`HTTP:  http://${FQDN}`);
      console.log(`HTTPS: https://${FQDN}`);

      conn.end();
    } catch (err) {
      console.error('Error:', err);
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
