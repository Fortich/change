const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite3');

db.serialize(() => {
  db.run('INSERT INTO professors VALUES ("ajsuarezf")');
});

db.close();
