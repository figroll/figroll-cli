# Figroll CLI
Upload your site to Figroll

## Tutorial

### Install

```bash
npm install -g figroll-cli
```

### Commands

```bash
Usage: figroll <command>

Commands:
  login     login to Figroll
  list      list your sites
  create    Create a new free site
  connect   Connect to your site
  deploy    Deploy to staging
  activate  Activate site to Production
```

### Logging In

You need to login to your existing Figroll account. If you don't have one
you can register on our website [Register](https://www.figroll.io/).

```bash
$ figroll login

Email: <your email>
Password: <your password>
```

### List
To show a list of all of your sites hosted on Figroll use:
```bash
$ figroll list
```

### Creating a new site
Creating a new free site is super simple with:
```bash
$ figroll create

You created site:
    site: bread-171.figroll.it
```


### Connecting
When we are ready to deploy our site, we can simply connect to that site, making sure we pass in your built site folder (dist-folder)

```bash
$ figroll connect bread-171.figroll.it dist/
```

### Deploying
With `figroll deploy` it pushes your site straight up to your staging enviorment.
```bash
$ figroll deploy
```

### Activate
Once your happy you can activate your site on production. This also activates HTTPS on your site.
```bash
$ figroll activate
```
