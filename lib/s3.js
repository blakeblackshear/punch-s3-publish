(function() {
  var AWS, DeepFstream, fs, mime, path, zlib, _;

  AWS = require('aws-sdk');

  DeepFstream = require('./deepfstream');

  _ = require('underscore');

  path = require('path');

  fs = require('fs');

  mime = require('mime');

  zlib = require('zlib');

  module.exports = {
    lastPublishedDate: null,
    publishOptions: null,
    client: null,
    retrieveOptions: function(supplied_config) {
      var error;
      error = 'Cannot find s3 settings in config';
      if ('publish' in supplied_config && 'options' in supplied_config['publish']) {
        return supplied_config['publish']['options'];
      } else {
        throw error;
      }
    },
    isModified: function(modified_date) {
      return modified_date > this.lastPublishedDate;
    },
    copyFile: function(local_path, remote_path, callback) {
      var _this = this;
      return fs.readFile(local_path, function(error, buf) {
        if (error) {
          throw error;
        }
        return zlib.gzip(buf, function(_, zipped) {
          var ext, options;
          options = {
            Body: zipped,
            Key: remote_path,
            ContentLength: zipped.length,
            ContentType: mime.lookup(local_path),
            ContentEncoding: 'gzip'
          };
          _.extend(options, this.publishOptions.s3_options);
          if (options.ContentType === 'text/html' && this.publishOptions.remove_html_extensions) {
            ext = path.extname(options.Key);
            options.Key = options.Key.replace(ext, '');
          }
          console.log("Saving " + local_path);
          return this.client.putObject(options, function(err, data) {
            if (err != null) {
              throw err;
            }
            return callback();
          });
        });
      });
    },
    fetchAndCopyFiles: function(supplied_config, complete) {
      var file_stream, output_dir, output_dir_path,
        _this = this;
      output_dir = (supplied_config && supplied_config.output_dir) || '';
      output_dir_path = path.join(process.cwd(), output_dir);
      file_stream = new DeepFstream(output_dir_path);
      file_stream.on('directory', function(entry, callback) {
        return callback();
      });
      file_stream.on('file', function(entry, callback) {
        var relative_path;
        if (_this.isModified(entry.props.mtime)) {
          relative_path = path.relative(output_dir_path, entry.path);
          return _this.copyFile(entry.path, relative_path, callback);
        } else {
          return callback();
        }
      });
      return file_stream.on('end', function() {
        return complete();
      });
    },
    loadAwsCredentials: function() {
      if ((this.publishOptions.credentials.accessKeyId != null) && (this.publishOptions.credentials.secretAccessKey != null) && (this.publishOptions.credentials.region != null)) {
        return AWS.config.update(this.publishOptions.credentials);
      } else if (this.publishOptions.credentials.file != null) {
        return AWS.config.loadFromPath(this.publishOptions.credentials.file);
      }
    },
    publish: function(supplied_config, last_published_date, callback) {
      console.log("Publishing to S3...");
      this.publishOptions = this.retrieveOptions(supplied_config);
      this.loadAwsCredentials();
      this.client = new AWS.S3();
      this.lastPublishedDate = last_published_date;
      return this.fetchAndCopyFiles(supplied_config, callback);
    }
  };

}).call(this);
