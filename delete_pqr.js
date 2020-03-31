const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite3');

db.serialize(() => {
  db.run('DROP TABLE IF EXISTS recommend ');
  db.run('CREATE TABLE recommend (name TEXT, email TEXT, type TEXT, msg TEXT)');
});

db.close();
