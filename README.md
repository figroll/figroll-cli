# Figroll CLI

Upload your site to Figroll

## Tutorial

### Install

```bash
npm install -g figroll-cli
```

### Logging In

You need to login to your existing Figroll account.

```bash
byron@lingon ~/p/spring-270> figroll login
Email: <your email>
Password: <your password>
```

### Connecting

You should have created a site on Figroll already. Ensuring that
you are in your project folder connect up to Figroll

```bash

byron@lingon ~> cd prj/spring-270
byron@lingon ~/p/spring-270> figroll list
1: spring-270.figroll.it
byron@lingon ~/p/spring-270> figroll connect spring-270.figroll.it
Connected!
```

### Deploying

```bash
byron@lingon ~/p/spring-270> zip -r public.zip public_html/
byron@lingon ~/p/spring-270> figroll deploy -f pubilc.zip -e prod
Uploaded!

  Site on staging at http://nm1rq3j1f6stk2jd.x.figroll.it
  > Site now live at http://spring-270.figroll.it <
```
