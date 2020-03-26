**Change Project Backend**

API Rest para la manipulación de peticiones por parte de los estudiantes a los profesores de la Universidad Nacional de Colombia, dentro del marco de respuestas de la Facultad de Ingeniería ante la situación de Emergencial Nacional por la situación sanitaria del COVID-19.

**Config**
config/config.json
```javascript
{
	"ldap": {
		"url": "ldap://ldap.ldap.ldap",
		"searchBase": "ou=ou,o=o",
		"searchFilter": "(uid={{username}})",
		"timeout": 5000,
		"connectTimeout": 10000,
		"reconnect": true
	},
	"jwt": {
		"secret": "secretsupersecure"
	},
	"mailer": {
		"service": "Gmail",
		"host": "smtp.gmail.com",
		"secure": true,
		"port": 465,
		"auth": {
			"user": "maileruser",
			"pass": "mailerpass"
		}
	  }
}

```

**Migration**
`node migrate.js`

**Install dependencies**
`yarn install`

**Start**
`yarn start`
