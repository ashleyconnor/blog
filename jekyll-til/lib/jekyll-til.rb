# frozen_string_literal: true

module Jekyll
  module Til
    DEFAULT_LAYOUT_PAGE = "til"
  end
end

%w(til).each do |file|
  require File.expand_path("jekyll/commands/#{file}.rb", __dir__)
end
