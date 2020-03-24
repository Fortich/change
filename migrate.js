var sqlite3 = require('sqlite3').verbose()
var db = new sqlite3.Database('database.sqlite3')

db.serialize(function () {
  db.run('DROP TABLE IF EXISTS professors ')
  db.run('CREATE TABLE professors (dni VARCHAR(25), name VARCHAR(255), user VARCHAR(255))')
  var stmt = db.prepare('INSERT INTO professors VALUES (dni, "Nombre", "usuario")')
  stmt.run()
  stmt.finalize()

  db.each('SELECT dni, name, user FROM professors', function (err, row) {
    console.log(row.dni + ': ' + row.name + ', ' + row.user)
  })
  db.run('DROP TABLE IF EXISTS request ')
  db.run('CREATE TABLE request (Programa TEXT, Tipo_Documento TEXT, Documento TEXT, PBM TEXT, Procedencia TEXT, Celular TEXT, Direccion TEXT, Apoyo TEXT, Descripcion TEXT)')

})

db.close()