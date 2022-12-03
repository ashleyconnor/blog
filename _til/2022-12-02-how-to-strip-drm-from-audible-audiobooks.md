---
layout: single
title: How to strip DRM from Audible audiobooks
---

I have a subscription with Audible which allows you to download an audiobook a month for keeps.

These books can be listened to on the Audible app but if you want to use another app then it needs to support [Audible's DRM system](https://help.audible.com/s/article/does-audible-use-drm-or-any-other-mechanisms-to-protect-titles-on-audible-from-unauthorized-distribution-and-modification?language=en_US).

The particular app I wanted to use did not support DRM so I chose to remove the DRM from my purchases books.

To do this we'll use a Python project `audible-cli`.

Install this using `pip`:

```shell
$ pip install audible-cli
```

Once installed we can run `audible quickstart` - this will start a wizard that creates a configuration file.

Next we can run `audible library list` to list our Audible library and choose the audiobook we want to download.

```shell
$ audible library list
...
B015ELUYL4: Kurt Vonnegut: Slaughterhouse-Five
```

We can then download the `aax` file using the download subcommand:

```shell
$ audible download --aax --asin B015ELUYL4
```

Once downloaded we need the activate bytes to decode the DRM:

```shell
$ audible activation-bytes
7224181c
```

With these bytes we can convert the `aax` to `mp3` without DRM:

```shell
$ ffmpeg -activation_bytes 7224181c -i Slaughterhouse-Five-LC_64_22050_stereo.aax Slaughterhouse-Five-LC_64_22050_stereo.mp3
```

Alternatively [AAXtoMP3](https://github.com/KrumpetPirate/AAXtoMP3) does a great job of converting the `aax` to a variety of codecs (AAC command shown below) whilst keeping metadata and cover-art intact.

```shell
$ bash AAXtoMP3 -a -A 7224181c Slaughterhouse-Five-LC_64_22050_stereo.aax
```
