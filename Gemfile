source "https://rubygems.org"
ruby RUBY_VERSION

gem 'json', '>= 1.8'

# Hello! This is where you manage which Jekyll version is used to run.
# When you want to use a different version, change it below, save the
# file and run `bundle install`. Run Jekyll with `bundle exec`, like so:
#
#     bundle exec jekyll serve
#
# This will help ensure the proper Jekyll version is running.
# Happy Jekylling!
gem "jekyll", "3.10.0"

# If you want to use GitHub Pages, remove the "gem "jekyll"" above and
# uncomment the line below. To upgrade, run `bundle update github-pages`.
# gem "github-pages", group: :jekyll_plugins
gem "jekyll-redirect-from"

# If you have any plugins, put them here!
group :jekyll_plugins do
   gem 'jekyll-compose', "~> 0.12.0"
   gem 'jekyll-til', path: './jekyll-til'
   gem "jekyll-feed", "~> 0.6"
   gem "jekyll-twitter-plugin"
end

gem "minimal-mistakes-jekyll", "~> 4.27.0"

gem "kramdown-parser-gfm"

# cloudflare pages junk
gem "ffi", "< 1.17.0"
