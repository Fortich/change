var settings = require('./config/conf.json');

var bodyParser = require('body-parser');
var jwt = require('jwt-simple');
var moment = require('moment');
var LdapAuth = require('ldapauth-fork');
var Promise = require('promise');
var fs = require('fs');
var sqlite3 = require('sqlite3').verbose()
var db = new sqlite3.Database('database.sqlite3')

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

var auth = new LdapAuth(ldapSetts);

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

app.get('/request', function (req, res) {
	var token = req.headers.token;
	if (token) {
		try {
			var decoded = jwt.decode(token, app.get('jwtTokenSecret'));

			if (decoded.exp <= parseInt(moment().format("X"))) {
				res.status(400).send({ error: 'Access token has expired'});
			} else {
				db.all('SELECT * FROM request', (error, rows) => {
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
	var query = 'INSERT INTO request VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
	db.run(query, [
		res.body.Programa,
		res.body.Tipo_Documento,
		res.body.Documento,
		res.body.PBM,
		res.body.Procedencia,
		res.body.Celular,
		res.body.Direccion,
		res.body.Apoyo,
		res.body.Descripcion,
	], (err) => {})
})

var port = (process.env.PORT || 3000);
app.listen(port, function() {
	console.log('Listening on port: ' + port);

	if (typeof settings.ldap.reconnect === 'undefined' || settings.ldap.reconnect === null || settings.ldap.reconnect === false) {
		console.warn('WARN: This service may become unresponsive when ldap reconnect is not configured.')
	}
});