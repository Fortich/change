const settings = require('./config/conf.json');
const bodyParser = require('body-parser');
const jwt = require('jwt-simple');
const moment = require('moment');
const LdapAuth = require('ldapauth-fork');
const Promise = require('promise');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite3');
const nodemailer = require('nodemailer');
const hbs = require('handlebars');

app = require('express')();

app.use(bodyParser.json());
app.use(require('cors')());

const gmailTransport = nodemailer.createTransport('SMTP', settings.mailer);

ldapSetts = settings.ldap;
ldapSetts.tlsOptions = {
  tlsOptions: {
    ca: [fs.readFileSync('./cert.pem')],
  },
};

let auth = new LdapAuth(ldapSetts);

app.set('jwtTokenSecret', settings.jwt.secret);

const authenticate = (username, password) => {
  return new Promise((resolve, reject) => {
    auth.authenticate(username, password, (err, user) => {
      if (err) {
        reject(err);
      } else if (!user) {
        reject(new Error('Not correct user'));
      } else {
        resolve(user);
      }
    });
  });
};

app.get('/valid', (req, res) => {
  if (req.headers.token) {
    try {
      const decoded = jwt.decode(req.headers.token, app.get('jwtTokenSecret'));
      if (decoded.exp <= parseInt(moment().format('X'))) {
        res.json({valid: 'no'});
        return;
      } else {
        res.json({valid: 'yes'});
        return;
      }
    } catch (err) {
      res.json({valid: 'no'});
      return;
    }
  } else {
    res.json({valid: 'no'});
    return;
  }
});

app.post('/login', (req, res) => {
  if (req.body.username && req.body.password) {
    if (/^[a-zA-Z]/.test(req.body.username)) {
      authenticate(req.body.username, req.body.password)
          .then((user) => {
            const expires = parseInt(moment().add(2, 'days').format('X'));
            const token = jwt.encode({
              exp: expires,
              user_name: user.uid,
              full_name: user.cn,
              mail: user.mail,
            }, app.get('jwtTokenSecret'));
            db.get(
                'SELECT count(user) as count FROM professors WHERE user ' +
                'like "' + user.uid + '"',
                (err, row) => {
                  if (row.count===0) {
                    res.status(401)
                        .send({error: 'Unauthorized, not proffesor.'});
                  } else {
                    res.json({token: token, full_name: user.cn});
                    return;
                  }
                });
          })
          .catch((err) => {
            if (err.name === 'InvalidCredentialsError'||
              (typeof err === 'string' && err.match(/no such user/i))) {
              res.status(401).send({error: 'Wrong user or password'});
            } else {
              res.status(500).send({error: 'Unexpected Error'});
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

app.get('/sponsor', (req, res) => {
  const token = req.headers.token;
  if (token) {
    try {
      const decoded = jwt.decode(token, app.get('jwtTokenSecret'));
      if (decoded.exp <= parseInt(moment().format('X'))) {
        res.status(400).send({error: 'Access token has expired'});
      } else {
        db.all('SELECT * FROM sponsor INNER JOIN request on ' +
          ' request.request_id = sponsor.request_id where ' +
          'sponsor.professor like ?',
        [decoded.user_name],
        (error, rows) => {
          if (error) {
            res.json({error: 'Could not get sponsors'});
            return;
          } else {
            res.json({rows});
            return;
          }
        });
      }
    } catch (err) {
      res.status(500).send({error: 'Access token could not be decoded'});
    }
  } else {
    res.status(400).send({error: 'Access token is missing'});
  }
});

app.post('/sponsor', (req, res) => {
  const token = req.headers.token;
  if (token) {
    try {
      const decoded = jwt.decode(token, app.get('jwtTokenSecret'));
      if (decoded.exp <= parseInt(moment().format('X'))) {
        res.status(400).send({error: 'Access token has expired'});
      } else {
        db.run('UPDATE request SET Apadrinado = 1 WHERE request_id like ?',
            [req.body.request_id],
            (error, rows) => {
              if (error) {
                res.json({error: 'Could not update request status'});
                return;
              }
            });
        db.get('SELECT * FROM request WHERE request_id = ?',
            [req.body.request_id],
            (err, row) => {
              try {
                db.run('INSERT INTO sponsor VALUES(?,?)',
                    [decoded.user_name, req.body.request_id],
                    (error, rows) => {
                      if (error) {
                        res.json({error: 'There is a problem updating the DB'});
                        return;
                      }
                      try {
                        const emailCompiled = hbs.compile(
                            fs.readFileSync('views/email/toProfessor.hbs')
                                .toString(),
                        )({
                          nombre: row.Nombre,
                          programa: row.Programa,
                          pbm: row.PBM,
                          procedencia: row.Procedencia,
                          apoyo: row.Apoyo,
                          correo: row.Correo,
                          celular: row.Celular,
                          direccion: row.Direccion,
                        });
                        const HelperOptions = {
                          from: 'Decanatura - Facultad de Ingenieria' +
                            '<decfaci_bog@unal.edu.co>',
                          to: decoded.mail,
                          subject: '[Apoya UN] Gracias!',
                          html: emailCompiled,
                        };
                        gmailTransport
                            .sendMail(HelperOptions, (error, info) => {
                              if (error) {
                                console.log(error);
                                res.json(error);
                                return;
                              }
                              res.json(info);
                              return;
                            });
                      } catch (err) {
                        console.log('the mail could not be sent');
                        res.json({error: 'The mail could not be sent'});
                        return;
                      }
                    });
              } catch (err) {
                res.status(400).send({error: 'invalid request id.'});
              }
            });
      }
    } catch (err) {
      res.status(500).send({error: 'Access token could not be decoded'});
    }
  } else {
    res.status(400).send({error: 'Access token is missing'});
  }
});

/**
 * Says if register has Bogotá procedence.
 * @param {string} procedencia The string to be compared.
 * @return {int} 1 if provedencia is like bogota, 0 otherwise.
 */
function includesBogot(procedencia) {
  if (procedencia.toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().includes('bogota')) {
    return 0;
  } else {
    return 1;
  }
}

/**
 * Shows the priority level of register.
 * @param {Register} row The register to be compared.
 * @return {int} The value of the priority of the register.
 */
function getPrioriry(row) {
  return 80 * ((100 - parseInt(row.PBM)) / 100.0) +
    20 * includesBogot(row.Procedencia);
}

app.get('/prequest', (req, res) => {
  const token = req.headers.token;
  if (token) {
    try {
      const decoded = jwt.decode(token, app.get('jwtTokenSecret'));
      if (decoded.exp <= parseInt(moment().format('X'))) {
        res.status(400).send({error: 'Access token has expired'});
      } else {
        const query = 'SELECT request_id, Programa, Fecha, PBM, Procedencia, ' +
          'Bogota, Apoyo, Descripcion FROM request ' +
          'where Apadrinado = 0 AND Apoyo like "%canasta%"';
        db.all(query, (error, r) => {
          if (error) {
            res.json({error: 'The request doesnt exist'});
            return;
          }

          try {
            const rows = Array.prototype.slice.call(r);
            rows.map((row) => {
              row.Fecha = row.Fecha.split('T')[0];
            });
            rows.sort((a, b) => {
              return getPrioriry(b) - getPrioriry(a);
            });
            res.json({rows});
            return;
          } catch (err) {
            res.status(500).send({
              error: 'Error retriving values ' +
                err.toString(),
            });
          }
        });
      }
    } catch (err) {
      res.status(500).send({error: 'Access token could not be decoded'});
    }
  } else {
    res.status(400).send({error: 'Access token is missing'});
  }
});

app.post('/request', (req, res) => {
  const query = 'INSERT INTO request VALUES (?, ?, ?, ?, ?, ?, ?, ' +
    '?, ?, ?, ?, ?, ?, ?, ?)';
  try {
    db.run(query, [
      undefined,
      req.body.Nombre,
      req.body.Correo,
      req.body.Fecha,
      req.body.Programa,
      req.body.Tipo_Documento,
      req.body.Documento,
      req.body.PBM,
      req.body.Procedencia,
      req.body.Bogota,
      req.body.Celular,
      req.body.Direccion,
      req.body.Apoyo,
      req.body.Descripcion,
      0,
    ],
    (err) => {
      console.log(err);
    });
  } catch (err) {
    res.status(500).send({status: 'Internal server error'});
    Console.log('There is a problem posting the request into the database');
  }
  res.status(200).send({status: 'Confirmed'});
});

const port = (process.env.PORT || 3001);
app.listen(port, function() {
  console.log('Listening on port: ' + port);
  if (typeof settings.ldap.reconnect === 'undefined' ||
    settings.ldap.reconnect === null || settings.ldap.reconnect === false) {
    console.warn('WARN: This service may become unresponsive ' +
      'when ldap reconnect is not configured.');
  }
});
