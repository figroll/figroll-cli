#!/usr/bin/env node
"use strict";

let toml = require('toml-js');
let fs = require('fs');
let https = require('https');
let request = require('request');
let read = require('read');
let userHome = require('user-home');

var argv = require('yargs')
    .usage('Usage: $0 <command> [options]')

    .command('login', 'login to Figroll', function(yargs) {
        argv = yargs.demand(1)
            .example('$0 login', 'login to Figroll')
            .argv;
    })

    .command('create', 'Create a new site', function(yargs) {
        argv = yargs.demand(2, 2)
            .example("$0 create sitename.com")
            .argv;
    })

    .command('connect', 'Connect to your site', function(yargs) {
        argv = yargs.demand(2, 2)
            .example("$0 connect sitename.com")
            .argv;
    })

    .command('list', 'list your sites', function(yargs) {
        argv = yargs.demand(1, 1)
            .example("$0 list")
            .argv;
    })

    .command('deploy', 'Deploy to Production', function(yargs) {
        argv = yargs.demand('f')
        .alias('f', 'file')
        .nargs('f', 1)
        .describe('f', 'File to upload')

        .demand('env')
        .alias('e', 'env')
        .choices('env', ["prod", "stage"])
        .describe('env', 'Environment to deploy to')

        .alias('y', 'yes')
        .nargs('y', 0)
        .describe('y', 'Assume Yes to all queries and do not prompt')

        .example('$0 deploy [-y] -e (prod|stage) -f public.zip', 'deploy to production')

        .argv;
    })

    .demand(1, "")

    .argv;

let dir = userHome + "/.figroll";
let path = dir + "/config.toml";

function _getConfig(cfgPath) {
    return new Promise(function(resolve, reject) {
        try {
            return resolve(toml.parse(fs.readFileSync(cfgPath).toString()));
        } catch(e) {
            return reject(e);
        }
    });
}

function getGlobalConfig() {
    return _getConfig(userHome + "/.figroll/config.toml");
}

function getLocalConfig() {
    return _getConfig("figroll.toml");
}

function getConfig() {
    return Promise.all([getGlobalConfig(), getLocalConfig()]);
}

function testGlobalConfig(cfg) {
    return new Promise(function(resolve, reject) {
        if(!cfg.userId) {
            return reject("userId not found in config");
        }

        if(!cfg.token) {
            return reject("token not found in config");
        }

        return resolve(cfg);
    });
}

function testLocalConfig(cfg) {
    return new Promise(function(resolve, reject) {
        if(!cfg.siteId) {
            return reject("siteId not found in config");
        }

        return resolve(cfg);
    });
}

function login() {
    function getEmail() {
        return new Promise(function(resolve, reject) {
            read({"prompt": "Email: "}, function(err, res, isDefault) {
                if(err) {
                    reject();
                    return;
                }

                resolve(res);
            });
        });
    }

    function getPassword() {
        return new Promise(function(resolve, reject) {
            read({"prompt": "Password: ", "silent": true, "replace": "*"}, function(err, res, isDefault) {
                if(err) {
                    reject();
                    return;
                }
                resolve(res);
            });
        });
    }

    let credentialPromise = new Promise(function(resolve, reject) {
        getEmail().then(function(email) {
            getPassword().then(function(password) {
                resolve({
                    "email": email,
                    "password": password
                });
            }, reject)
        }, reject)
    });

    let promise = new Promise(function(resolve, reject) {
        credentialPromise.then(function(credentials) {
            request.post({
                url: 'https://app.figroll.io:2113/auth/login',
                json: credentials
            }, function(err, res, body) {
                if(err || res.statusCode !== 200) {
                    reject();
                    return;
                }

                resolve(body);
            });
        });

        // TODO: Request long lived token here
    });

    credentialPromise.then(function() {
        rl.close();
    }, function() {
        rl.close();
    })

    return promise;
}

function saveToken(user) {
    return new Promise(function(resolve, reject) {
        if(!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir);
            } catch(e) {
                reject(e);
                return;
            }
        }

        let parsed;

        try {
            parsed = toml.parse(fs.readFileSync(path).toString());
        } catch(e) {
            parsed = {};
        }

        parsed.userId = user.user.id;
        parsed.token = user.token;

        try {
            fs.writeFileSync(path, toml.dump(parsed));
        } catch(e) {
            reject(e);
            return;
        }

        resolve();
    })
}

function testToken(token) {
    console.log("Testing Authentication");
    return new Promise(function(resolve, reject) {
        https.get({
                hostname: "app.figroll.io",
                port: 2113,
                path: "/tokens/me",
                headers: {
                    "Authorization": token
                }
        }).on("response", function(res) {
            if(res.statusCode !== 200) {
                console.log("status code does not match" + res.statusCode);
                reject(false);
                return;
            }

            resolve(true);
            return;
        }).on("error", function(e, r) {
            console.log("error")
            reject(r);
            return;
        });
    });
}

function create(globalConfig) {
    return new Promise(function(resolve, reject) {
        request.post({
            url: 'https://app.figroll.io:2113/sites',
            headers: {
                "Authorization": globalConfig.token
            },
            json: {
                fqdn: argv._[1]
            }
        }).on("response", function(res) {
            if(res.statusCode !== 201) {
                reject(res.statusCode);
                return;
            }

            return resolve(true);
        }).on("error", function(e, r) {
            console.log("error")
            return reject(r);
        });
    });
}

function connect(cfg) {
    return new Promise(function(resolve, reject) {
        list(cfg).then(function(body) {
            let sites = body.filter(function(site) {
                return site.fqdn == argv._[1];
            });

            if(sites.length === 0) {
                return reject("You have not created site: " + argv._[1]);
            }

            let site = sites[0];

            let fd;
            let parsed;

            try {
                fd = fs.openSync("figroll.toml", "w+");
            } catch(e) {
                return reject(e);
            }

            try {
                parsed = toml.parse(fs.readFileSync(fd).toString());
            } catch(e) {
                return reject(e);
            }

            parsed.siteId = site.id;
            parsed.fqdn = site.fqdn;
            parsed.cname = site.cname;

            if(parsed.token) {
                delete parsed["token"];
            }

            try {
                fs.writeFileSync(fd, toml.dump(parsed));
            } catch(e) {
                return reject(e);
            }

            return resolve();
        }).catch(reject);
    });
}

function list(globalConfig) {
    return new Promise(function(resolve, reject) {
        request.get({
            url: 'https://app.figroll.io:2113/sites',
            json: true,
            headers: {
                "Authorization": globalConfig.token
            }
        }, function(err, res, body) {
            if(err || res.statusCode !== 200) {
                return reject();
            }

            return resolve(body);
        });
    });
}

function displayList(sites) {
    sites.sort(function(a, b) {
        return new Date(a.createdAt) - new Date(b.createdAt);
    }).forEach(function(site, idx) {
        console.log(idx + 1 + ": " + site.fqdn);
    });
}

function upload(cfgs, zipfileName) {
    let globalConfig = cfgs[0];
    let localConfig = cfgs[1];

    return new Promise(function(resolve, reject) {
        request.post({
            url: 'https://app.figroll.io:2113/sites/' + localConfig.siteId + "/upload",
            formData: {
                file: fs.createReadStream(zipfileName),
            },
            headers: {
                "Authorization": globalConfig.token
            },
            json: true
        }, function optionalCallback(err, res, body) {
            if (err || res.statusCode !== 200) {
              return reject(err, res.statusCode);
            }

            return resolve(body);
        });
    });
}

function activate(cfgs, version) {
    let globalConfig = cfgs[0];
    let localConfig = cfgs[1];

    if(argv.e == "prod") {
        version.isLive = true;
    }

    return new Promise(function(resolve, reject) {
        request.put({
            url: 'https://app.figroll.io:2113/sites/' + localConfig.siteId + "/versions/" + version.id,
            headers: {
                "Authorization": globalConfig.token
            },
            json: version
        }, function optionalCallback(err, httpResponse, body) {
            if (err) {
                return reject(err);
            }

            return resolve(body);
        });
    });
};

function doLogin() {
    login()
        .catch(function() {
            console.log("could not login - your username and password are probably incorrect");
        })
        .then(saveToken)
        .then(function() {
            console.log("  You are now logged in");
            console.log("")
        })
        .catch(function(e) {
            console.log(e);
            console.log("could not save token");
        });
}

function doCreate() {
    getGlobalConfig(path)
        .then(testGlobalConfig)
        .catch(function(e) {
            console.log(e);
            console.log("Config could not be read");
            console.log("Try logging in");
        })
        .then(create)
        .then(function() {
            console.log("Site Created - you'll need to run connect now!");
        })
        .catch(function(e) {
            console.log("Site not created")
            switch(e) {
                case 400:
                    console.log("Incorrect Domain name specified");
                    break;
                case 409:
                    console.log("Site already exists");
                    break;
                default:
                    console.log(e);
                    break;
            }
        });
}

function doConnect() {
    getGlobalConfig(path)
        .then(testGlobalConfig)
        .catch(function(e) {
            console.log(e);
            console.log("Config could not be read");
            console.log("Try logging in");
        })
        .then(connect)
        .then(function() {
            console.log("Connected!");
        })
        .catch(function(e) {
            console.log(e);
            console.log("Could not connect")
        });
}

function doList() {
    getGlobalConfig(path)
        .then(testGlobalConfig)
        .catch(function(e) {
            console.log(e);
            console.log("Config could not be read");
            console.log("Try logging in");
        })
        .then(list)
        .then(displayList)
        .catch(function(e) {
            console.log(e);
        });
}

function doDeploy() {
    getConfig(path)
        .then(function(cfgs) {
            let globalConfig = cfgs[0];
            let localConfig = cfgs[1];

            return new Promise(function(resolve, reject) {
                testGlobalConfig(globalConfig)
                    .then(testLocalConfig)
                    .then(resolve([globalConfig, localConfig]))
                    .catch(reject);
            });
        })
        .catch(function(e) {
            console.log(e);
            console.log("Config could not be read");
            console.log("Try logging in");
        })
        .then(function(cfgs) {
            return new Promise(function(resolve, reject) {
                upload(cfgs, argv.f)
                    .then(function(version) {
                        return activate(cfgs, version);
                    })
                    .then(function(version) {
                        console.log("Uploaded!");
                        console.log("")
                        console.log("  Site on staging at " + version.stagingUrl)
                        if(argv.e === "prod") {
                            console.log("  > Site now live at http://" + cfgs[1].fqdn + " <");
                            console.log("")
                        }
                    })
                    .catch(reject)
            });
        })
        .catch(function(err) {
            console.log("Could not upload site :(");
            console.log(err);
        });
}

switch(argv._[0]) {
    case "login":
        doLogin();
        break;
    case "create":
        doCreate();
        break;
    case "connect":
        doConnect();
        break;
    case "list":
        doList();
        break;
    case "deploy":
        doDeploy();
        break;
    default:
        console.error("`" + argv._[0] + "` is not a valid command");
        break;
}
