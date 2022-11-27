---
title: How to remove Self Control
---

I was toying with applications that block time-wasting websites in the hope that the friction would lead me to be more productive.

[Self Control](https://selfcontrolapp.com/) is one solution.

Annoyingly Self Control isn't easily stopped once a timer is started, and the application doesn't come with an uninstaller.

Usually when uninstalling apps on OSX I make use of a very helpful freeware program [App Cleaner](https://freemacsoft.net/appcleaner/).

App Cleaner found most of the installed files and removed them, however if you've already started a blocking timer then there are a few other things that we need to clean up.

* Stop Self Control from automatically restarting - `launchctl unload -w /Library/LaunchDaemons/org.eyebeam.selfcontrold.plist` (App Cleaner had already removed the plist file).
* Kill the Self Control process - `sudo killall SelfControl`.
* Remove the timer lock file - `sudo rm /etc/SelfControl.lock`.

With the process dead and unloaded from [`launchd`](https://www.launchd.info/) we can now remove the firewall rules that were added.

First edit the root [`pf`](https://en.wikipedia.org/wiki/PF_(firewall)) config file `sudo vim /etc/pf.conf` and remove the `load anchor "org.eyebeam" from "/etc/pf.anchors/org.eyebeam"` entry.

Then remove the anchor file `sudo rm /etc/pf.anchors/org.eyebeam`.

Reload `pf` with `sudo pfctl -f /etc/pf.conf`.

Finally we need to remove any host entries that Self Control added by removing the Self Control block from the `/etc/hosts` file `sudo vim /etc/hosts`.

Websites previously blocked should now be accessible. To overcome DNS caching issues you may need to run `sudo killall -HUP mDNSResponder`.
