#!/usr/bin/env node

"use strict";

let toml = require('toml-js');
let fs = require('fs');
let https = require('https');
let request = require('request');
let read = require('read');
let userHome = require('user-home');
let yazl = require("yazl");
let glob = require("glob");
let numeral = require("numeral");
let color = require("bash-color");
var open = require("open");

let displayList = require('./displayList');

var argv = require('yargs')
    .usage('Usage: $0 <command> [options]')

// .option("h", {
//     alias: "h",
//     description: "Help"
// })

.command('login', 'login to Figroll', function(yargs) {
    argv = yargs.demand(1)
        .example('$0 login', 'login to Figroll')
        .argv;
})

.command('list', 'list your sites', function(yargs) {
    argv = yargs.demand(1, 1)
        .example("$0 list")
        .argv;
})


.command('create', 'Create a new free site', function(yargs) {
    argv = yargs.demand(1, 1)
        .example("$0 create")

    .argv;
})

.command('connect', 'Connect to your site', function(yargs) {
    argv = yargs.demand(3)
        .usage('Usage: $0 <command> dist-path')
        .example('$0 connect sites/my-new-site dist/')
        .argv;
})

.command('deploy', 'Deploy to staging', function(yargs) {
    argv = yargs.demand(1)
        .usage('Usage: $0 <command>')
        .example('$0 deploy', 'deploy directory to staging')
        .argv;
})

.command('activate', 'Activate site to Production', function(yargs) {
    argv = yargs.demand(1)
        .usage('Usage: $0 <command>')
        .example('$0 activate', 'Activate site to production')
        .argv;
})

.demand(1, "")
    .argv;

let dir = userHome + "/.figroll";
let path = dir + "/config.toml";
const API_URL = "https://app.figroll.io/api";

function _getConfig(cfgPath) {
    return new Promise(function(resolve, reject) {
        try {
            return resolve(toml.parse(fs.readFileSync(cfgPath).toString()));
        } catch (e) {
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
        if (!cfg.userId) {
            return reject("userId not found in config");
        }

        if (!cfg.token) {
            return reject("token not found in config");
        }

        return resolve(cfg);
    });
}

function testLocalConfig(cfg) {
    return new Promise(function(resolve, reject) {
        if (!cfg.siteId) {
            return reject("siteId not found in config");
        }

        return resolve(cfg);
    });
}

function login() {

    function getEmail() {
        return new Promise(function(resolve, reject) {
            read({
                "prompt": "Email: "
            }, function(err, res, isDefault) {
                if (err) {
                    reject();
                    return;
                }
                resolve(res);
            });
        });
    }

    function getPassword() {
        return new Promise(function(resolve, reject) {
            read({
                "prompt": "Password: ",
                "silent": true,
                "replace": "*"
            }, function(err, res, isDefault) {
                if (err) {
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
                url: API_URL + '/auth/login',
                json: credentials
            }, function(err, res, body) {
                if (err || res.statusCode !== 200) {
                    reject(err);
                    return;
                }
                resolve(body);
            });
        });

        // TODO: Request long lived token here
    });

    return promise;
}

function saveToken(user) {
    return new Promise(function(resolve, reject) {

        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir);
            } catch (e) {
                reject(e);
                return;
            }
        }

        let parsed;

        try {
            parsed = toml.parse(fs.readFileSync(path).toString());
        } catch (e) {
            parsed = {};
        }

        parsed.userId = user.user.id;
        parsed.token = user.token;

        try {
            fs.writeFileSync(path, toml.dump(parsed));
        } catch (e) {
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
            if (res.statusCode !== 200) {
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


    let getFreeDomain = new Promise(function(resolve, reject) {
        request.get({
            url: API_URL + '/domains/next',
            json: true
        }, function(err, res, body) {

            if (err || res.statusCode !== 200) {
                return reject();
            }

            return resolve(body);
        });
    });

    let createFreeSite = new Promise(function(resolve, reject) {
        getFreeDomain.then(function(body) {

            request.post({
                url: API_URL + '/sites',
                headers: {
                    "Authorization": globalConfig.token
                },
                json: {
                    fqdn: body.fqdn,
                    plan: "free"
                }
            }, function(err, res, body) {

                if (err || res.statusCode !== 201) {
                    return reject();
                }

                return resolve(body);
            });

        })
    });

    return createFreeSite;

}


function connect(cfg) {
    return new Promise(function(resolve, reject) {
        list(cfg).then(function(body) {

            let sites = body.filter(function(site) {
                return site.fqdn == argv._[1];
            });

            if (sites.length === 0) {
                return reject("You have not created site: " + argv._[1]);
            }

            let site = sites[0];

            var fd = fs.openSync("figroll.toml", "w");
            try {
                fs.writeFileSync(fd, toml.dump({
                    siteId: site.id,
                    fqdn: site.fqdn,
                    cname: site.cname,
                    distPath: argv._[2]
                }));
            } catch (e) {
                return reject(e);
            }

            return resolve(site);
        }).catch(reject);

    });
}

function list(globalConfig) {
    return new Promise(function(resolve, reject) {
        request.get({
            url: API_URL + '/sites',
            json: true,
            headers: {
                "Authorization": globalConfig.token
            }
        }, function(err, res, body) {
            if (err || res.statusCode !== 200) {
                return reject();
            }

            return resolve(body);
        });
    });
}

function upload(cfgs) {
    let globalConfig = cfgs[0];
    let localConfig = cfgs[1];

    var getStream = new Promise(function(resolve, reject) {
        let stream;

        try {
            fs.lstatSync(localConfig.distPath)
        } catch (e) {
            return reject(e);
        }

        if (!fs.lstatSync(localConfig.distPath).isFile()) {
            let outFn = "/tmp/" + "figroll_zip_" + process.pid + "_output.zip";
            let ws = fs.createWriteStream(outFn);
            var zipfile = new yazl.ZipFile();

            glob(localConfig.distPath + "/**", function(er, files) {
                files.forEach(function(filename) {
                    if (fs.lstatSync(filename).isFile()) {
                        zipfile.addFile(filename, filename);
                    }
                });
                zipfile.outputStream.pipe(ws).on("close", function() {
                    // console.log(numeral(fs.statSync(outFn).size).format("0 b"));
                    resolve([outFn, true]);
                });
                zipfile.end();
            });
        } else {
            resolve([localConfig.distPath, false]);
        }
    });


    let result = new Promise(function(resolve, reject) {
        getStream.then(function(details) {
                let zfn = details[0];
                let unlinkAfter = details[1];

                request.post({
                    url: API_URL + '/sites/' + localConfig.siteId + "/upload",
                    formData: {
                        file: {
                            value: fs.createReadStream(zfn),
                            options: {
                                filename: "public.zip",
                                contentType: "application/zip"
                            }
                        }
                    },
                    headers: {
                        "Authorization": globalConfig.token
                    },
                    json: true
                }, function optionalCallback(err, res, body) {
                    // console.log(err);
                    if (err || res.statusCode !== 200) {
                        return reject(err, res.statusCode);
                    }

                    return resolve(body);
                });
            })
            .catch(function(e) {
                return reject(e);
            });
    });

    getStream.then(function(details) {
        let zfn = details[0];
        let unlinkAfter = details[1];

        result.then(function() {
            if (unlinkAfter) {
                fs.unlinkSync(zfn);
            }
        });
    })

    return result;
}

function activate(cfgs) {
    let globalConfig = cfgs[0];
    let localConfig = cfgs[1];



    let versionsPromise = new Promise(function(resolve, reject) {

        request.get({
            url: API_URL + '/sites/' + localConfig.siteId + "/versions",
            headers: {
                "Authorization": globalConfig.token,
                "Accept": "application/json"
            }
        }, function(err, resp, body) {

            if (body.length === 0) {
                return reject("No versions exist");
            }

            body = JSON.parse(body)
            if (err) {
                return reject(err);
            }



            resolve(body[0]);
        });
    })


    let activateVersion = function(version) {
        version.isLive = true;
        return new Promise(function(resolve, reject) {
            request.put({
                url: API_URL + '/sites/' + localConfig.siteId + "/versions/" + version.id,
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

    return versionsPromise.then(activateVersion);

};

function configure() {
    return new Promise(function(resolve, reject) {
        resolve();
    });
}

function doLogin() {
    login()
        .then(function(user) {

            return saveToken(user)
                .then(function(response) {
                    console.log(color.green("You are now logged in!"));
                    console.log("")
                    console.log("List yours sites:");
                    console.log('    (use "figroll list")');
                    console.log("")
                    console.log("Connect to a site:");
                    console.log('    (use "figroll connect <site-domain> dist-path")');
                })
                .catch(function(error) {
                    console.log(color.red("Could not save token."));
                })

        })
        .catch(function(error) {
            console.log(color.red("Could not login, Please check your username and password."));
        })
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
        .then(function(res) {
            console.log("");
            console.log("You created site:");
            console.log(color.green("    site: " + res.fqdn));
            console.log("")
            console.log("Connect to a site:");
            console.log('    (use "figroll connect ' + res.fqdn + ' dist-path")');
        })
        .catch(function(e) {
            console.log("Site not created")
            switch (e) {
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
        .then(function(site) {
            console.log("");
            console.log("Connected to:");
            console.log(color.green("    site: " + site.fqdn));
            console.log("");
            console.log("Deploy your site:");
            console.log('    (use "figroll deploy ' + site.fqdn + '")');
            console.log("");
            console.log("Read config:");
            console.log('    (use "cat figroll.toml")');
        })
        .catch(function(e) {
            console.log("");
            console.log(color.red(e));
            console.log("");
            console.log("List yours sites:");
            console.log('    (use "figroll list")');
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
            console.log(color.red("Config could not be read"));
            console.log("");
            console.log("Try logging in:");
            console.log('    (use "figroll login")');
        })
        .then(function(cfgs) {
            return new Promise(function(resolve, reject) {
                configure(cfgs).then(function() {
                    console.log(color.green("Uploading..."))
                    upload(cfgs)
                        .then(function(res) {
                            console.log("");
                            console.log("Your site had been deployed to staging:");
                            console.log("");
                            console.log(color.green("    Staging URL: " + res.stagingUrl));
                            open(res.stagingUrl);
                            console.log("");
                            console.log("Now activate your site to make it live live:");
                            console.log('    (use "figroll activate")');
                        })
                        .catch(function(e) {
                            console.log(color.red('Can\'t find "' + cfgs[1].distPath + '" in current folder'))
                            console.log("");
                            console.log("You can fix this:");
                            console.log('    (figroll.toml)');
                        });
                });
            });
        })
}

function doActivate() {
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
            console.log(color.red("Config could not be read"));
            console.log("");
            console.log("Try logging in:");
            console.log('    (use "figroll login")');
        })
        .then(function(cfgs) {
            return new Promise(function(resolve, reject) {
                configure(cfgs)
                    .then(function() {
                        activate(cfgs)
                            .then(function(res) {
                                console.log("");
                                console.log("Your site had been deployed to production:");
                                console.log("");
                                console.log(color.green("    Production URL: " + cfgs[1].fqdn));

                                open("https://" + cfgs[1].fqdn);
                            })
                            .catch(function(e) {
                                console.log("Please make sure you are logged in and connected to a site.");
                                console.log("")
                                console.log("See commands:");
                                console.log('    (use "figroll")');
                                console.log("")
                                console.log("Connect to a site:");
                                console.log('    (use "figroll connect <site-domain> dist-path")');
                                console.log("")
                                console.log("List yours sites:");
                                console.log('    (use "figroll list")');
                            });
                    });
            });
        })
}

switch (argv._[0]) {
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
    case "activate":
        doActivate();
        break;
    default:
        console.error("`" + argv._[0] + "` is not a valid command");
        break;
}
