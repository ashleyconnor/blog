---
title: Installing ssh-copy-id on a Synology NAS
date: "2026-10-29T10:20:21-07:00"
tags:
  - tools
  - synology
---

`ssh-copy-id` isn't installed on DSM 7+ and is unavailable from the Synology Package Center (or the [SynoCommunity Package repo](https://synocommunity.com/)).

I wanted to copy SSH keys between my DS420+ and my other servers so let's install the tool to do that.

```shell
mkdir -p "$HOME/.local/bin" "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

curl -fL \
  https://raw.githubusercontent.com/openssh/openssh-portable/master/contrib/ssh-copy-id \
  -o "$HOME/.local/bin/ssh-copy-id" &&
chmod 755 "$HOME/.local/bin/ssh-copy-id"
```

Validate the installation and add to the PATH

```shell
"$HOME/.local/bin/ssh-copy-id" -h

# make the command available on the PATH in the current session
export PATH="$HOME/.local/bin:$PATH"

# [optional] persist it across new sessions
echo 'export PATH="$HOME/.local/bin:$PATH"' > ~/.profile
```

Finally we can call it with the key we wish to copy

```shell
ssh-copy-id -i "$HOME/.ssh/id_ed25519.pub" username@destination
```

If you don't have a key yet, generate one using `ssh-keygen` which is installed on DSM 7+

```shell
ssh-keygen -t ed25519
```

I also add an SSH conf entry to make it easier to connect to each server

```
Host desktop
    HostName <ip_address>
    User <user>
    IdentityFile /var/services/homes/<user>/.ssh/id_ed25519
    IdentitiesOnly yes
```

Then we can simply call `ssh desktop` to connect.
