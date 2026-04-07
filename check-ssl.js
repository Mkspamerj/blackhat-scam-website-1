const { Client } = require('ssh2');

const HOST = '187.77.217.31';
const USER = 'root';
const PASS = process.env.VPS_PASS || 'RidaputitadeoverCloud726363()()';

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
  conn.on('ready', async () => {
    console.log('Conectado. Verificando certificado SSL...\n');
    await exec(conn, 'docker logs caddy-proxy 2>&1 | tail -10');
    console.log('\n\nProbando acceso HTTPS...');
    await exec(conn, 'curl -sI https://ticketmastercheckout.duckdns.org 2>&1 | head -5');
    console.log('\nProbando acceso HTTP...');
    await exec(conn, 'curl -sI http://ticketmastercheckout.duckdns.org 2>&1 | head -5');
    conn.end();
  });
  conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 30000,
    algorithms: { kex: ['curve25519-sha256','curve25519-sha256@libssh.org','ecdh-sha2-nistp256','ecdh-sha2-nistp384','ecdh-sha2-nistp521','diffie-hellman-group-exchange-sha256','diffie-hellman-group14-sha256','diffie-hellman-group16-sha512','diffie-hellman-group18-sha512','diffie-hellman-group14-sha1'] }
  });
}
main();
