FROM ruby:2.7

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY ./ .

RUN bundle install

ENTRYPOINT [ "jekyll" ]
