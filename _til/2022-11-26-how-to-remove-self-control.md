---
title: How to remove Self Control
---

I was toying with applications that block time-wasting websites in the hope that the friction would lead me to be more productive.

This led me to [Self Control](https://selfcontrolapp.com/).

Annoyingly Self Control isn't easily stopped once a timer is start, and also doesn't come with an uninstaller.

Usually when uninstalling apps on OSX I make use of a very helpful freeware program [App Cleaner](https://freemacsoft.net/appcleaner/).

App Cleaner found most of the files and removed them, however if you've already started a blocking timer then there are a few other things that we need to clean up.

* Stop Self Control from automaticallt restarting - `launchctl unload -w /Library/LaunchDaemons/org.eyebeam.selfcontrold.plist`
* Kill the process - `sudo killall SelfControl`
* Remove the lock file - `sudo rm /etc/SelfControl.lock`

With the process dead and removed from launchd we can now remove the firewall rules added.

First edit the root [`pf`](https://en.wikipedia.org/wiki/PF_(firewall)) config file `sudo vim /etc/pf.conf` and remove the `load anchor "org.eyebeam" from "/etc/pf.anchors/org.eyebeam"` entry.

Then remove the anchor file `sudo rm /etc/pf.anchors/org.eyebeam`.

Reload `pf` with `sudo pfctl -f /etc/pf.conf`.

Websites previously blocked should now be accessible. To overcome DNS caching issues you may need to run `sudo killall -HUP mDNSResponder`.
