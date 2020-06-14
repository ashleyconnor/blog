---
title: Deploying a Phoenix application to Dokku
excerpt: In this tutorial I'm going to show you how easy it is to deploy a [Phoenix](http://www.phoenixframework.org/) web application on a server running [Dokku](http://dokku.viewdocs.io/dokku/)...
---

## Introduction

In this tutorial I'm going to show you how easy it is to deploy a [Phoenix](http://www.phoenixframework.org/) web application on a server running [Dokku](http://dokku.viewdocs.io/dokku/).

As an extra bonus, we will also configure our application to use a valid SSL certificate with just a few extra commands.

## Prerequisites

1. Server running Dokku with SSH configured to connect remotely (I highly recommend using [Digital Ocean's 1-click](https://www.digitalocean.com/features/one-click-apps/dokku/) solution)
2. A domain name pointing at your Digital Ocean VPS with a [wildcard A record set](https://www.namecheap.com/support/knowledgebase/article.aspx/597/10/how-can-i-set-up-a-catchall-wildcard-subdomain)
3. A recent version of Git installed locally

## 1. Clone the sample application

First, we will need a sample application to deploy to our server. So we will be using Chris McCord's [Phoenix Chat Example](https://github.com/chrismccord/phoenix_chat_example).

You can either fork and clone or simply clone this project locally like so:

{% highlight bash %}
$ git clone https://github.com/chrismccord/phoenix_chat_example.git
{% endhighlight %}

Once we have the project on our machine, we are going to add a new remote URL to the repository.

{% highlight bash %}
$ git remote add dokku dokku@mydomain.com:phoenix
{% endhighlight %}

This will set a second remote URL to the repository and allow us to push our updates to our Dokku server. We can see all remotes by running:

{% highlight bash %}
$ git remote
dokku
master
{% endhighlight %}

## 2. Configure the application for production

Next, we will have to make a small change to our sample application so that it will work correctly in our production environment.

Since this application does not use a database the only change we require is setting the `host` and `secret_key_base` to use environment variables we will configure shortly. To fix this, in `config/prod.exs` replace:
{% highlight elixir %}
config :chat, Chat.Endpoint,
  http: [port: {:system, "PORT"}],
  url: [host: "example.com"]
{% endhighlight %}

With:
{% highlight elixir %}
config :chat, Chat.Endpoint,
  http: [port: {:system, "PORT"}],
  url: [host: System.get_env("HOSTNAME"), port: 80]
{% endhighlight %}

We also need to replace the hardcoded secret key with an environment variable. Open up `config/prod.secret.exs` and replace:
{% highlight elixir %}
secret_key_base: "XR7e8rPXq2nIdBXqtPsyxPz1R1UF3w4HDBFGdxZ..."
{% endhighlight %}

With:
{% highlight elixir %}
secret_key_base: System.get_env("SECRET_KEY_BASE")
{% endhighlight %}

In the same file if we had a database to configure, we would also change:

{% highlight elixir %}
# Configure your database
config :chat, Chat.Repo,
  adapter: Ecto.Adapters.Postgres,
  username: "postgres",
  password: "postgres",
  database: "chat_prod"
{% endhighlight %}

 To:
{% highlight elixir %}
# Configure your database
config :chat, Chat.Repo,
  adapter: Ecto.Adapters.Postgres,
  url: System.get_env("DATABASE_URL")
{% endhighlight %}

This `DATABASE_URL` environment variable is given to us by Dokku when we link a Postgres database to our application.

## 3. Buildpacks

In order for Dokku to know how to install Elixir and Javascript dependencies and how to run our application, we need to tell it to use an Elixir buildpack.

Fortunately all the hard work of creating these has been done by productive members of the Elixir community.

We need a combination of 2 buildpacks in order to deploy our application. One for Elixir/Phoenix and another for our static assets. To use both of these buildpacks we first create a file in the root of our project named `.buildpacks` and add the following lines:

{% highlight text %}

https://github.com/HashNuke/heroku-buildpack-elixir.git
https://github.com/gjaldon/heroku-buildpack-phoenix-static.git

{% endhighlight %}

We then configure our `phoenix-static` buildpack to use a later version of Node required by Phoenix 1.1 and above.

To do this we create a file `phoenix_static_buildpack.config` and add the line below:

{% highlight text %}

node_version=5.3.0

{% endhighlight %}

## 4. Create the Dokku App

We are now ready to create the application in Dokku. We can do this via the [`dokku-cli`](https://github.com/SebastianSzturo/dokku-cli) gem, but for now we'll just SSH into our server to configure the application.

{% highlight bash %}

$ ssh root@mydomain.com
~# dokku apps:create phoenix
Creating phoenix... done

{% endhighlight %}

We will also add the environment variables we setup before:

{% highlight bash %}

~# dokku config:set phoenix SECRET_KEY_BASE=the_value_in_my_prod_secret_file HOSTNAME=phoenix.mydomain.com
-----> Setting config vars
   HOSTNAME:        phoenix.mydomain.com
   SECRET_KEY_BASE: the_value_in_my_prod_secret_file
-----> Restarting app phoenix
App phoenix has not been deployed

{% endhighlight %}

## 4b. Create a database (optional)

Creating a databse on Dokku is very straightforward. First we install the Postgres Dokku plugin if we don't have it already:

{% highlight bash %}

~# dokku plugin:install https://github.com/dokku/dokku-postgres.git postgres

{% endhighlight %}

Then we create the database itself:

{% highlight bash %}

~# dokku postgres:create phoenix
-----> Starting container
   Waiting for container to be ready
   Creating container database
   Securing connection to database
=====> Postgres container created: phoenix
   DSN: postgres://postgres:714bcafb6094059fe476dc82c80a91a6@dokku-postgres-phoenix:5432/phoenix

{% endhighlight %}

We can then link this container to our application with:

{% highlight bash %}

~# dokku postgres:link phoenix phoenix
-----> Setting config vars
       DATABASE_URL: postgres://postgres:714bcafb6094059fe476dc82c80a91a6@dokku-postgres-phoenix:5432/phoenix
-----> Restarting app phoenix
...
=====> Application deployed:
       https://phoenix.mydomain.com

{% endhighlight %}

The format is `postgres:link <name> <app>` where `name` is the name of the database and `app` is the name of the application.

We can also see that our `DATABASE_URL` environment variable has been set and is available to our application.

## 5. Push the application

Now on our local machine, we can now push the application to Dokku which will configure and deploy it:

{% highlight bash %}

$ git push dokku
-----> Cleaning up...
-----> Building phoenix from herokuish...
-----> Adding BUILD_ENV to build environment...
-----> Multipack app detected
=====> Downloading Buildpack: https://github.com/HashNuke/heroku-buildpack-elixir.git
=====> Detected Framework: elixir
-----> Checking Erlang and Elixir versions
...
-----> Running nginx-pre-reload
       Reloading nginx
-----> Setting config vars
       DOKKU_APP_RESTORE: 1
=====> Application deployed:
       http://phoenix.mydomain.com

To dokku@mydomain.com:phoenix
 * [new branch]      master -> master

{% endhighlight %}

If we navigate to [http://phoenix.mydomain.com](http://phoenix.mydomain.com) we will see the sample application running.

![Phoenix Chat Example Running](https://www.dropbox.com/s/ovetw1ozujfwgm2/Screenshot%202016-03-06%2011.59.16.png?dl=1)

Pretty sweet.

## 6. Bonus - SSL Encryption

Previously, adding SSL to an application was a sometimes tedious and pricey endeavour. But thanks to the folks at [Let's Encrypt](https://letsencrypt.org/) the process has been simplified enormously.

Let's add SSL to our sample application.

To do this we need to install the Let's Encrypt plugin for Dokku. So on your server run:

{% highlight bash %}

~# dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git

{% endhighlight %}

We then need to set an environment variable for our email, which is required to issue an SSL certificate:

{% highlight bash %}

~# dokku config:set --no-restart phoenix DOKKU_LETSENCRYPT_EMAIL=you@mydomain.com
-----> Setting config vars
   DOKKU_LETSENCRYPT_EMAIL: you@mydomain.com

{% endhighlight %}

Now to add a certificate to your application we simply run:

{% highlight bash %}

~# dokku letsencrypt phoenix
-----> Enabling ACME proxy for phoenix...
-----> Getting letsencrypt certificate for phoenix...
        - Domain 'phoenix.mydomain.com'
-----> Certificate retrieved successfully.
-----> Symlinking let's encrypt certificates
...
-----> Setting config vars
       DOKKU_NGINX_SSL_PORT: 443
-----> Configuring SSL for phoenix.mydomain.com...(using /var/lib/dokku/plugins/available/nginx-vhosts/templates/nginx.ssl.conf.template)
-----> Creating https nginx.conf
-----> Running nginx-pre-reload
       Reloading nginx
-----> Disabling ACME proxy for phoenix...
       done

{% endhighlight %}

Now we can visit our site securely at [https://phoenix.mydomain.com](https://phoenix.mydomain.com) and see the valid SSL certificate in action:

![SSL Certificate](https://www.dropbox.com/s/qx9d7h0sg3uziij/Screenshot%202016-03-06%2011.57.52.png?dl=1)

If you have any questions or spot an error just send me a tweet [@AshleyPConnor](https://twitter.com/AshleyPConnor)
