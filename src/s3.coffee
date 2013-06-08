AWS = require('aws-sdk')
DeepFstream = require './deepfstream'
_ = require 'underscore'
path = require 'path'
fs = require 'fs'
mime = require 'mime'

module.exports =
  lastPublishedDate: null
  publishOptions: null
  client: null

  retrieveOptions: (supplied_config) ->
    error = 'Cannot find s3 settings in config'
    if 'publish' of supplied_config and 'options' of supplied_config['publish']
      supplied_config['publish']['options']
    else
      throw error
      
  isModified: (modified_date) ->
    modified_date > @lastPublishedDate

  copyFile: (local_path, remote_path, callback) ->
    fs.readFile local_path, (error, buf) =>
      throw error  if error
      #remote_path = remote_path.replace(/\\/g, "/")

      options = 
        Body: buf
        Key: remote_path
        ContentLength: buf.length
        ContentType: mime.lookup(local_path)

      _.extend options, @publishOptions.s3_options

      if options.ContentType is 'text/html' and @publishOptions.remove_html_extensions
        ext = path.extname options.Key
        options.Key = options.Key.replace ext, ''

      console.log "Saving #{local_path}"
      @client.putObject options, (err, data) ->
        throw err if err?
        callback()

  fetchAndCopyFiles: (supplied_config, complete) ->
    output_dir = (supplied_config and supplied_config.output_dir) or ''
    output_dir_path = path.join(process.cwd(), output_dir)
    file_stream = new DeepFstream(output_dir_path)
    file_stream.on 'directory', (entry, callback) ->
      callback()

    file_stream.on 'file', (entry, callback) =>
      if @isModified(entry.props.mtime)
        relative_path = path.relative(output_dir_path, entry.path)
        @copyFile entry.path, relative_path, callback
      else
        callback()

    file_stream.on 'end', ->
      complete()

  loadAwsCredentials: ->
    if @publishOptions.credentials.accessKeyId? and @publishOptions.credentials.secretAccessKey? and @publishOptions.credentials.region?
      AWS.config.update @publishOptions.credentials
    else if @publishOptions.credentials.file?
      AWS.config.loadFromPath @publishOptions.credentials.file

  publish: (supplied_config, last_published_date, callback) ->
    console.log "Publishing to S3..."
    @publishOptions = @retrieveOptions(supplied_config)
    @loadAwsCredentials()
    @client = new AWS.S3()
    @lastPublishedDate = last_published_date
    @fetchAndCopyFiles supplied_config, callback
