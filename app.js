var settings = require('./config/conf.json');

var bodyParser = require('body-parser');
var jwt = require('jwt-simple');
var moment = require('moment');
var LdapAuth = require('ldapauth-fork');
var Promise = require('promise');
var fs = require('fs');
var sqlite3 = require('sqlite3').verbose()
var db = new sqlite3.Database('database.sqlite3')
var mailer = require('express-mailer');

app = require('express')();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(require('cors')());

ldapSetts = settings.ldap
ldapSetts.tlsOptions = {
	tlsOptions: {
		ca: [fs.readFileSync('./cert.pem')]
	  }
}

mailer.extend(app, settings.mailer);

var auth = new LdapAuth(ldapSetts);

app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.set('jwtTokenSecret', settings.jwt.secret);

var authenticate = function (username, password) {
	return new Promise(function (resolve, reject) {
		auth.authenticate(username, password, function (err, user) {
			if(err)
				reject(err);
			else if (!user)
				reject();
			else
				resolve(user);
		});
	});
};

app.post('/login', function (req, res) {
	if (req.body.username && req.body.password) {
		if (/^[a-zA-Z]/.test(req.body.username)) {
			authenticate(req.body.username, req.body.password)
			.then(function (user) {
				var expires = parseInt(moment().add(2, 'days').format("X"));
				var token = jwt.encode({
					exp: expires,
					user_name: user.uid,
					full_name: user.cn,
					mail: user.mail
				}, app.get('jwtTokenSecret'));
				
					var count = 0;
					db.get(
						'SELECT count(user) as count FROM professors WHERE user like "'
						+ user.uid + '"',
						function (err, row) {
							if (row.count===0) {
								res.status(401).send({ error: 'Unauthorized, not proffesor.'});
							} else {
								res.json({ token: token, full_name: user.cn });		
							}
					})
					
				
			})
			.catch(function (err) {
				// Ldap reconnect config needs to be set to true to reliably
				// land in this catch when the connection to the ldap server goes away.
				// REF: https://github.com/vesse/node-ldapauth-fork/issues/23#issuecomment-154487871

				console.log(err);

				if (err.name === 'InvalidCredentialsError' || (typeof err === 'string' && err.match(/no such user/i)) ) {
					res.status(401).send({ error: 'Wrong user or password'});
				} else {
					// ldapauth-fork or underlying connections may be in an unusable state.
					// Reconnect option does re-establish the connections, but will not
					// re-bind. Create a new instance of LdapAuth.
					// REF: https://github.com/vesse/node-ldapauth-fork/issues/23
					// REF: https://github.com/mcavage/node-ldapjs/issues/318

					res.status(500).send({ error: 'Unexpected Error'});
					auth = new LdapAuth(settings.ldap);
				}

			});
		} else {
			res.status(400).send({error: 'Bad username supplied'});
		}
	} else {
		res.status(400).send({error: 'No username or password supplied'});
	}
});

app.post('/sponsor', function (req, res) {
	var token = req.headers.token;
	if (token) {
		try {
			var decoded = jwt.decode(token, app.get('jwtTokenSecret'));

			if (decoded.exp <= parseInt(moment().format("X"))) {
				res.status(400).send({ error: 'Access token has expired'});
			} else {
				db.run('UPDATE request SET Apadrinado = 1 WHERE request_id like ?', [req.body.request_id], (error, rows) => {})
				db.get('SELECT Correo FROM request WHERE request_id = ?', [req.body.request_id], (err, row) => {
					console.log(err)
					console.log(req.body.request_id)
					db.run('INSERT INTO sponsor VALUES(?,?)', [decoded.user_name, row.Correo], (error, rows) => { 
						var errors = 0;
						app.mailer.send('toProfessor', {
							to: decoded.user_name + '@unal.edu.co',
							subject: '[Apadrina un Estudiante] Gracias!',
						  }, (err) => {
								(err) => {
									errors++;
							  res.status(400).json('There was an error sending the email to '+ decoded.user_name + '@unal.edu.co');
							  return;
							}
						});
						app.mailer.send('toStudent', {
							to: row.Correo,
							subject: '[Apadrina un Estudiante] Fuiste apadrinado!',
						  }, (err) => {
								if (err && errors !== 0) {
									errors++;
									res.status(400).json('There was an error sending the email to '+ row.Correo);
							  return;
							}
						});
						if (errors === 0) {
							res.json({ "sentTo": row.Correo });	
						}
						
					})
				})
			}
		} catch (err) {
			res.status(500).send({ error: 'Access token could not be decoded'});
		}
	} else {
		res.status(400).send({ error: 'Access token is missing'});
	}
})

app.get('/prequest', function (req, res) {
	var token = req.headers.token;
	if (token) {
		try {
			var decoded = jwt.decode(token, app.get('jwtTokenSecret'));

			if (decoded.exp <= parseInt(moment().format("X"))) {
				res.status(400).send({ error: 'Access token has expired'});
			} else {
				db.all('SELECT request_id, Programa, Fecha, PBM, Procedencia, Apoyo, Descripcion FROM request where Apadrinado = 0', (error, rows) => { 
					res.json(rows);
				})
			}
		} catch (err) {
			res.status(500).send({ error: 'Access token could not be decoded'});
		}
	} else {
		res.status(400).send({ error: 'Access token is missing'});
	}
});

app.post('/request', function (req, res) {
	var query = 'INSERT INTO request VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
	db.run(query, [
		undefined,
		req.body.Correo,
		req.body.Fecha,
		req.body.Programa,
		req.body.Tipo_Documento,
		req.body.Documento,
		req.body.PBM,
		req.body.Procedencia,
		req.body.Celular,
		req.body.Direccion,
		req.body.Apoyo,
		req.body.Descripcion,
		0,
	], (err) => {})
	res.status(200).send({status:'I tried all my best'})
})

var port = (process.env.PORT || 3000);
app.listen(port, function() {
	console.log('Listening on port: ' + port);

	if (typeof settings.ldap.reconnect === 'undefined' || settings.ldap.reconnect === null || settings.ldap.reconnect === false) {
		console.warn('WARN: This service may become unresponsive when ldap reconnect is not configured.')
	}
});