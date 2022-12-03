module Jekyll
  module Commands
    class Til < Command
      def self.init_with_program(prog)
        prog.command(:til) do |c|
          c.syntax 'til NAME'
          c.description 'Creates a new til with the given NAME'

          options.each {|opt| c.option *opt }

          c.action { |args, options| process args, options }
        end
      end

      def self.options
        [
          ['extension', '-x EXTENSION', '--extension EXTENSION', 'Specify the file extension'],
          ['layout', '-l LAYOUT', '--layout LAYOUT', "Specify the til layout"],
          ['force', '-f', '--force', 'Overwrite a til if it already exists'],
          ['date', '-d DATE', '--date DATE', 'Specify the til date'],
          ['config', '--config CONFIG_FILE[,CONFIG_FILE2,...]', Array, 'Custom configuration file'],
          ['source', '-s', '--source SOURCE', 'Custom source directory'],
        ]
      end

      def self.process(args = [], options = {})
        params = TilArgParser.new args, options
        params.validate!

        til = TilFileInfo.new params

        Compose::FileCreator.new(til, params.force?, params.source).create!
      end


      class TilArgParser < Compose::ArgParser
        def layout
          options["layout"] || Jekyll::Til::DEFAULT_LAYOUT_PAGE
        end

        def date
          options["date"].nil? ? Time.now : DateTime.parse(options["date"])
        end
      end

      class TilFileInfo < Compose::FileInfo
        def resource_type
          'til'
        end

        def path
          "_til/#{file_name}"
        end

        def file_name
          "#{_date_stamp}-#{super}"
        end

        def _date_stamp
          @params.date.strftime '%Y-%m-%d'
        end
      end
    end
  end
end
