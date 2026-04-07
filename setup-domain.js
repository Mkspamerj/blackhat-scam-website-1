const { Client } = require('ssh2');

const HOST = '187.77.217.31';
const USER = 'root';
const PASS = process.env.VPS_PASS || 'RidaputitadeoverCloud726363()()';

const DUCKDNS_TOKEN = '3cd342c5-b5d2-40f2-a3e7-330b8397f50e';
const DUCKDNS_DOMAIN = 'ticketmastercheckout';

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

async function main() {
  const conn = new Client();

  conn.on('error', (err) => {
    console.error('SSH Error:', err.message);
    process.exit(1);
  });

  conn.on('ready', async () => {
    try {
      console.log('=== Conectado al VPS ===\n');

      // 1. Update DuckDNS to point to VPS IP
      console.log('--- Actualizando DuckDNS con IP del VPS ---');
      await exec(conn, `curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=${HOST}" && echo ""`);

      // 2. Set up DuckDNS cron to auto-update IP every 5 min
      console.log('\n--- Configurando cron para DuckDNS ---');
      await exec(conn, `
        mkdir -p /opt/duckdns
        cat > /opt/duckdns/duck.sh << 'SCRIPT'
#!/bin/bash
curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=" -o /opt/duckdns/duck.log
SCRIPT
        # Replace placeholders
        sed -i 's/\${DUCKDNS_DOMAIN}/${DUCKDNS_DOMAIN}/g' /opt/duckdns/duck.sh
        sed -i 's/\${DUCKDNS_TOKEN}/${DUCKDNS_TOKEN}/g' /opt/duckdns/duck.sh
        chmod +x /opt/duckdns/duck.sh
        (crontab -l 2>/dev/null | grep -v duckdns; echo "*/5 * * * * /opt/duckdns/duck.sh") | crontab -
        echo "DuckDNS cron configured"
      `);

      // 3. Stop cloudflared tunnel (no longer needed)
      console.log('\n--- Deteniendo tunnel de Cloudflare (ya no necesario) ---');
      await exec(conn, 'pkill cloudflared 2>/dev/null; echo "Cloudflared stopped"');

      // 4. Stop current Docker container temporarily to free port 80
      console.log('\n--- Reconfigurando Docker con Caddy para HTTPS ---');
      await exec(conn, 'cd /root/web && docker compose down 2>/dev/null; echo "Container stopped"');

      // 5. Create new docker-compose with Caddy reverse proxy for HTTPS
      await exec(conn, `cat > /root/web/docker-compose.yml << 'EOF'
services:
  web:
    build: .
    container_name: ticketmaster-web
    restart: unless-stopped
    expose:
      - "80"
    environment:
      - PORT=80

  caddy:
    image: caddy:2-alpine
    container_name: caddy-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web

volumes:
  caddy_data:
  caddy_config:
EOF
echo "docker-compose.yml updated"
      `);

      // 6. Create Caddyfile for automatic HTTPS
      await exec(conn, `cat > /root/web/Caddyfile << 'EOF'
${DUCKDNS_DOMAIN}.duckdns.org {
    reverse_proxy web:80
}
EOF
echo "Caddyfile created"
      `);

      // 7. Build and start
      console.log('\n--- Levantando contenedores (web + Caddy HTTPS) ---');
      await exec(conn, 'cd /root/web && docker compose up -d --build');

      // 8. Wait for Caddy to get SSL cert
      console.log('\n--- Esperando certificado SSL ---');
      await exec(conn, 'sleep 8 && docker logs caddy-proxy 2>&1 | tail -20');

      // 9. Verify
      console.log('\n--- Verificando contenedores ---');
      await exec(conn, 'docker ps');

      console.log('\n\n========================================');
      console.log('   CONFIGURACION COMPLETADA');
      console.log('========================================');
      console.log(`\n  Tu web está en:`);
      console.log(`  https://${DUCKDNS_DOMAIN}.duckdns.org`);
      console.log(`  http://${HOST}/`);
      console.log('\n  HTTPS automático con certificado Let\'s Encrypt');
      console.log('  La IP se actualiza automáticamente cada 5 min');
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
