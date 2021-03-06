const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite3');

db.serialize(() => {
  db.run('DROP TABLE IF EXISTS professors ');
  db.run('CREATE TABLE professors (user VARCHAR(255))');
  const stmt = db.prepare('INSERT INTO professors VALUES ("ajsuarezf")');
  stmt.run();
  stmt.finalize();

  db.each('SELECT user FROM professors', (err, row) => {
    console.log(row.user);
  });
  db.run('DROP TABLE IF EXISTS request ');
  db.run(
      'CREATE TABLE request (request_id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'Nombre TEXT, Correo TEXT, Fecha TEXT, Programa TEXT, ' +
      'Tipo_Documento TEXT, Documento TEXT, PBM TEXT, Procedencia TEXT, ' +
      'Bogota TEXT, Celular TEXT, Direccion TEXT, Apoyo TEXT, ' +
      'Descripcion TEXT, Apadrinado INTEGER)');

  db.run('DROP TABLE IF EXISTS sponsor ');
  db.run('CREATE TABLE sponsor (professor VARCHAR(255), request_id INTEGER)');

  db.run('DROP TABLE IF EXISTS recommend ');
  db.run('CREATE TABLE recommend (name TEXT, email TEXT, type TEXT, msg TEXT)');
});

db.close();
