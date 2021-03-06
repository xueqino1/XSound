(function(global) {
    'use strict';

    /**
     * This subclass defines properties for playing the one-shot audio.
     * @param {AudioContext} context This argument is in order to use the interfaces of Web Audio API.
     * @constructor
     * @extends {SoundModule}
     */
    function OneshotModule(context) {
        Mocks.SoundModule.call(this, context);

        this.sources   = [];  /** @type {Array.<AudioBufferSourceNode>} */
        this.resources = [];  /** @type {Array.<string>} */
        this.buffers   = [];  /** @type {Array.<AudioBuffer>} */
        this.volumes   = [];  /** @type {Array.<GainNode>} */
        this.isStops   = [];  /** @type {Array.<boolean>} in order to not call in duplicate "start" or "stop" method in the instance of AudioBufferSourceNode */

        // for audio sources
        this.settings = [];  /** @type {Array.<object>} */

        // for scheduling
        this.times = {
            'start': 0,
            'stop' : 0
        };

        this.transpose = 1.0;

        this.isStop = true;

        // This flag determines whether sound wave is drawn
        this.isAnalyser = false;
    }

    /** @extends {SoundModule} */
    OneshotModule.prototype = Object.create(Mocks.SoundModule.prototype);
    OneshotModule.prototype.constructor = OneshotModule;

    /**
     * Class (Static) properties
     */
    OneshotModule.ERROR_AJAX         = 'error';
    OneshotModule.ERROR_AJAX_TIMEOUT = 'timeout';
    OneshotModule.ERROR_DECODE       = 'decode';

    /**
     * This method creates the instances of AudioBuffer by Ajax.
     * @param {Array.<string>|Array.<AudioBuffer>} resources This argument is either URLs or the instances of AudioBuffer for audio resources.
     * @param {Array.<object>} settings This argument is the properties of each audio sources.
     * @param {number} timeout This argument is timeout of Ajax. The default value is 60000 msec (1 minutes).
     * @param {function} successCallback This argument is invoked as next process when reading file is successful.
     * @param {function} errorCallback This argument is invoked when error occurred.
     * @param {function} progressCallback This argument is invoked during receiving audio data.
     * @return {OneshotModule} This is returned for method chain.
     * @override
     */
    OneshotModule.prototype.setup = function(resources, settings, timeout, successCallback, errorCallback, progressCallback) {
        // The argument is associative array ?
        if (Object.prototype.toString.call(arguments[0]) === '[object Object]') {
            var properties = arguments[0];

            if ('resources' in properties) {resources        = properties.resources;}
            if ('settings'  in properties) {settings         = properties.settings;}
            if ('timeout'   in properties) {timeout          = properties.timeout;}
            if ('success'   in properties) {successCallback  = properties.success;}
            if ('error'     in properties) {errorCallback    = properties.error;}
            if ('progress'  in properties) {progressCallback = properties.progress;}
        }

        if (!Array.isArray(resources)) {
            resources = [resources];
        }

        this.resources = resources;

        if (!Array.isArray(settings)) {
            settings = [settings];
        }

        this.buffers.length = resources.length;

        for (var i = 0, len = settings.length; i < len; i++) {
            if ('buffer' in settings[i]) {
                var buffer = parseInt(settings[i].buffer);

                if ((buffer >= 0) && (buffer < this.buffers.length)) {
                    settings[i].buffer = buffer;
                } else {
                    return;
                }
            } else {
                return;
            }

            settings[i].rate   = (('rate'   in settings[i]) && (settings[i].rate >= 0))                               ? parseFloat(settings[i].rate)   : 1;
            settings[i].loop   =  ('loop'   in settings[i])                                                           ? Boolean(settings[i].loop)      : false;
            settings[i].start  = (('start'  in settings[i]) && (settings[i].start >= 0))                              ? parseFloat(settings[i].start)  : 0;
            settings[i].end    = (('end'    in settings[i]) && (settings[i].end   >= 0))                              ? parseFloat(settings[i].end)    : 0;
            settings[i].volume = (('volume' in settings[i]) && (settings[i].volume >=0) && (settings[i].volume <= 1)) ? parseFloat(settings[i].volume) : 1;

            this.isStops[i] = true;
            this.volumes[i] = this.context.createGain();
            this.envelopegenerator.setGenerator(i);
        }

        this.settings = settings;

        // If the error is at least 1, this method aborts the all of connections.
        // Therefore, this flag are shared with the all instances of XMLHttpRequest.
        var isError = false;

        var t = parseInt(timeout);

        var self = this;

        // Get ArrayBuffer by Ajax -> Create the instances of AudioBuffer
        var load = function(url, index) {
            var xhr = new XMLHttpRequest();

            xhr.timeout = (t > 0) ? t : 60000;

            xhr.ontimeout = function(error) {
                if (!isError && (Object.prototype.toString.call(errorCallback) === '[object Function]')) {
                    errorCallback(error, OneshotModule.ERROR_AJAX_TIMEOUT);
                }

                isError = true;
            };

            xhr.onprogress = function(event) {
                if (isError) {
                    xhr.abort();
                } else if (Object.prototype.toString.call(progressCallback) === '[object Function]') {
                    progressCallback(event);
                }
            };

            xhr.onerror = function(event) {
                if (!isError && (Object.prototype.toString.call(errorCallback) === '[object Function]')) {
                    errorCallback(event, OneshotModule.ERROR_AJAX);
                }

                isError = true;
            };

            // Success
            xhr.onload = function(event) {
                if (xhr.status === 200) {
                    var arrayBuffer = xhr.response;

                    if (!(arrayBuffer instanceof ArrayBuffer)) {
                        return;
                    }

                    var decodeSuccessCallback = function(audioBuffer) {
                        self.buffers[index] = audioBuffer;

                        // The creating the instances of AudioBuffer has completed ?
                        for (var i = 0, len = self.buffers.length; i < len; i++) {
                            if (self.buffers[i] === undefined) {
                                return;
                            }
                        }

                        if (Object.prototype.toString.call(successCallback) === '[object Function]') {
                            successCallback.call(self, event, self.buffers);
                        }
                    };

                    var decodeErrorCallback = function(error) {
                        if (Object.prototype.toString.call(errorCallback) === '[object Function]') {
                            errorCallback(error, OneshotModule.ERROR_DECODE);
                        }
                    };

                    self.context.decodeAudioData(arrayBuffer, decodeSuccessCallback, decodeErrorCallback);
                }
            };

            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';  // XMLHttpRequest Level 2
            xhr.send(null);
        };

        for (var i = 0, len = this.resources.length; i < len; i++) {
            if (Object.prototype.toString.call(this.resources[i]) === '[object String]') {
                // Get the instances of AudioBuffer from the designated URLs.
                load(this.resources[i], i);
            } else if (this.resources[i] instanceof AudioBuffer) {
                // Get the instances of AudioBuffer directly
                this.buffers[i] = this.resources[i];
            }
        }

        return this;
    };

    /**
     * This method is getter or setter for parameters.
     * @param {string|object} key This argument is property name in the case of string type.
     *     This argument is pair of property and value in the case of associative array.
     * @param {number} value This argument is the value of designated property. If this argument is omitted, This method is getter.
     * @return {number|OneshotModule} This is returned as the value of designated property in the case of getter. Otherwise, this is returned for method chain.
     * @override
     */
    OneshotModule.prototype.param = function(key, value) {
        if (Object.prototype.toString.call(arguments[0]) === '[object Object]') {
            // Associative array
            for (var k in arguments[0]) {
                this.param(k, arguments[0][k]);
            }
        } else {
            var k = String(key).replace(/-/g, '').toLowerCase();

            var r = Mocks.SoundModule.prototype.param.call(this, k, value);

            if (r !== undefined) {
                // Getter
                return r;
            } else {
                switch (k) {
                    case 'transpose':
                        if (value === undefined) {
                            // Getter
                            return this.transpose;
                        } else {
                            // Setter
                            var v   = parseFloat(value);
                            var min = 0;

                            if (v > min) {
                                this.transpose = v;
                            }
                        }

                        break;
                    default:
                        break;
                }
            }
        }

        return this;
    };

    /**
     * This method schedules the time of start and stop.
     * @param {number} startTime This argument is the start time. The default value is 0.
     * @param {number} stopTime This argument is the stop time. The default value is 0.
     * @return {OneshotModule} This is returned for method chain.
     * @override
     */
    OneshotModule.prototype.ready = function(startTime, stopTime) {
        var st = parseFloat(startTime);
        var sp = parseFloat(stopTime);

        if (st >=  0) {this.times.start = st;} else {this.times.start = 0;}
        if (sp >= st) {this.times.stop  = sp;} else {this.times.stop  = 0;}

        this.envelopegenerator.clear();

        return this;
    };

    /**
     * This method starts one-shot audio with the designated playback rate and volume.
     * @param {number} index This argument is in order to select the instance of AudioBufferSourceNode.
     * @param {Array.<Effector>} connects This argument is the array for changing the default connection.
     * @param {function} processCallback This argument is in order to change "onaudioprocess" event handler in the instance of ScriptProcessorNode.
     * @return {OneshotModule} This is returned for method chain.
     * @override
     */
    OneshotModule.prototype.start = function(index, connects, processCallback) {
        var selectedIndex = parseInt(index);

        if (isNaN(selectedIndex) || (selectedIndex < 0) || (selectedIndex >= this.settings.length)) {
            return;
        }

        var bufferIndex  = this.settings[selectedIndex].buffer;
        var playbackRate = this.settings[selectedIndex].rate;
        var loop         = this.settings[selectedIndex].loop;
        var loopStart    = this.settings[selectedIndex].start;
        var loopEnd      = this.settings[selectedIndex].end;
        var volume       = this.settings[selectedIndex].volume;

        if (!(this.buffers[bufferIndex] instanceof AudioBuffer)) {
            // "setup" method has not been invoked
            return;
        }

        // the instance of AudioBufferSourceNode already exists ?
        if (this.sources[selectedIndex] instanceof AudioBufferSourceNode) {
            this.sources[selectedIndex].stop(this.context.currentTime);
            this.sources[selectedIndex].disconnect(0);
            this.sources[selectedIndex] = null;
        }

        var source = this.context.createBufferSource();

        // for legacy browsers
        source.start = source.start || source.noteGrainOn;
        source.stop  = source.stop  || source.noteOff;

        source.buffer = this.buffers[bufferIndex];

        // Set properties
        source.playbackRate.value = playbackRate * this.transpose;
        source.loop               = loop;
        source.loopStart          = loopStart;
        source.loopEnd            = loopEnd;

        this.volumes[selectedIndex].gain.value = volume;

        this.envelopegenerator.clear();

        // AudioBufferSourceNode (Input) -> GainNode (Envelope Generator) -> GainNode (Volume) -> ScriptProcessorNode -> ... -> AudioDestinationNode (Output)
        this.envelopegenerator.ready(selectedIndex, source, this.volumes[selectedIndex]);
        this.volumes[selectedIndex].connect(this.processor);
        this.connect(this.processor, connects);

        var startTime = this.context.currentTime + this.times.start;

        source.start(startTime);

        this.sources[selectedIndex] = source;

        // Attack -> Decay -> Sustain
        this.envelopegenerator.start(startTime);

        this.on(startTime);

        if (!this.isAnalyser) {
            this.analyser.start('time');
            this.analyser.start('fft');
            this.isAnalyser = true;
        }

        this.isStops[selectedIndex] = false;

        var self = this;

        // in the case of scheduling stop time
        if (this.times.stop > 0) {
            global.setTimeout(function() {
                self.stop(selectedIndex);
            }, (this.times.stop * 1000));
        }

        // Call on stopping audio
        source.onended = function() {
            self.isStops[selectedIndex] = true;
        };

        if (Object.prototype.toString.call(processCallback) === '[object Function]') {
            this.processor.onaudioprocess = processCallback;
        } else {
            this.processor.onaudioprocess = function(event) {
                self.isStop = self.isStops.every(function(element, index, array) {
                    return element;
                });

                if (self.isStop) {
                    // Stop

                    self.off(self.context.currentTime);

                    self.envelopegenerator.clear();

                    self.analyser.stop('time');
                    self.analyser.stop('fft');
                    self.isAnalyser = false;

                    // Stop onaudioprocess event
                    this.disconnect(0);
                    this.onaudioprocess = null;
                } else {
                    var inputLs  = event.inputBuffer.getChannelData(0);
                    var inputRs  = event.inputBuffer.getChannelData(1);
                    var outputLs = event.outputBuffer.getChannelData(0);
                    var outputRs = event.outputBuffer.getChannelData(1);

                    outputLs.set(inputLs);
                    outputRs.set(inputRs);
                }
            };
        }

        return this;
    };

    /**
     * This method stops the designated one-shot audio.
     * @param {number} index This argument is in order to select the instance of AudioBufferSourceNode.
     * @return {OneshotModule} This is returned for method chain.
     * @override
     */
    OneshotModule.prototype.stop = function(index) {
        var selectedIndex = parseInt(index);

        if (isNaN(selectedIndex) || (selectedIndex < 0) || (selectedIndex >= this.settings.length)) {
            return;
        }

        var bufferIndex= this.settings[selectedIndex].buffer;

        if (!((this.buffers[bufferIndex] instanceof AudioBuffer) && (this.sources[selectedIndex] instanceof AudioBufferSourceNode))) {
            return;
        }

        var stopTime = this.context.currentTime + this.times.stop;

        // Attack or Decay or Sustain -> Release
        this.envelopegenerator.stop(stopTime);

        this.filter.stop(stopTime);

        for (var i = 0, len = this.plugins.length; i < len; i++) {
            this.plugins[i].plugin.stop(stopTime, this.envelopegenerator.param('release'));
        }

        return this;
    };

    /**
     * This method gets the instance of AudioBuffer that is used in OneshotModule.
     * @param {number} index This argument is required in the case of designating AudioBuffer.
     * @return {Array.<AudioBuffer>|AudioBuffer}
     * @override
     */
    OneshotModule.prototype.get = function(index) {
        var i = parseInt(index);

        if ((i >= 0) && (i < this.buffers.length)) {
            return this.buffers[i];
        } else {
            return this.buffers;
        }
    };

    /** @override */
    OneshotModule.prototype.params = function() {
        var params = Mocks.SoundModule.prototype.params.call(this);

        params.oneshot = {
            'transpose': this.transpose
        };

        return params;
    };

    /**
     * This method resets settings.
     * @param {number} index This argument is in order to select target setting.
     * @param {string} key This argument is in order to select parameter.
     * @param {number|boolean} value This argument is new value.
     * @return {OneshotModule} This is returned for method chain.
     */
    OneshotModule.prototype.reset = function(index, key, value) {
        var selectedIndex = parseInt(index);

        if (String(key).toLowerCase() in this.settings[selectedIndex]) {
            this.settings[selectedIndex][key.toLowerCase()] = value;
        }

        return this;
    };

    /** @override */
    OneshotModule.prototype.toString = function() {
        return '[OneshotModule]';
    };

    // Export
    global.OneshotModule = OneshotModule;
    global.oneshotModule = new OneshotModule(audiocontext);

})(window);
