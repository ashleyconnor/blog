---
title: How to run a shell script over images with Automator
tags: til
description: ""
excerpt: ""
---

When posting screenshots of text to Twitter sometimes the thumbnail gets messed up and clips
the content making it unreadable without clicking to expand.

I was using a handy [script](https://gist.github.com/ashleyconnor/ee6481430fc166e4fe8688e54b848c6b) I'd put together that leverages [ImageMagick](https://imagemagick.org/index.php) to resize to any image to 1600x900px, which is the optimal size for Twitter feeds.

The script also uses ImageMagick's histogram feature to fill in any empty space using the dominant color of the image. This is expecially hand when clipping text that has a background other than white, like the [Financial Times](https://www.ft.com/).

Executing the script is what this post is about.

Firing up the command line, looking for the image and running the script with the image path as an argument is tedious.

It'd be much nicer if we could right click an image or a selection of images and resize them right in Finder.

Enter [Automator](https://en.wikipedia.org/wiki/List_of_macOS_built-in_apps#Automator).

Automator allows us to create a "Quick Action" which can be accessed using a right-click of a mouse or a two-fingered click of the trackpad.

![Quick Action Automator Document Type](/assets/images/automator/quick_action.png)

In the workflow options we will select:

- Workflow receives current "Image files" in "any application"
- Choose any "Image"
- Choose any "Color"

Then in the Actions side-menu we will search for "Run Shell Script" and drag it into our workflow.

For the Shell I've selected "/bin/bash" and for Pass Input "as arguments".

I then paste in [my script](https://gist.github.com/ashleyconnor/ee6481430fc166e4fe8688e54b848c6b) from before.

The workflow then looks like this:

[![Finished Workflow](/assets/images/automator/workflow.png)](/assets/images/automator/workflow.png)

Then once we save the Quick Action becomes available in our conext menu:

![Context menu showing our new quick action](/assets/images/automator/context_menu.png)

An example of the resize:

Before

![Before our quick action has processed the image](/assets/images/automator/before.png)

After

![After our quick action has processed the image](/assets/images/automator/after.png)
