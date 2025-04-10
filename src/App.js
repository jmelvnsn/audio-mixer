import React, { useState, useRef, useEffect } from 'react';
import tape from './images/reel.png';
import reverb from './images/reverb.png';
import './App.css';

function Channel({ index, gain, onGainChange, audioCtx }) {
  const [buffer, setBuffer] = useState(null);
  const [source, setSource] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [pauseTime, setPauseTime] = useState(0);
  const [loop, setLoop] = useState(false);
  const [mix, setMix] = useState(0.3); // reverb mix: 0 = 100% dry, 1 = 100% wet
  const [pitch, setPitch] = useState(1);
  const [randomActive, setRandomActive] = useState(false);
  const randomIntervalRef = useRef(null);

  // Create audio nodes for this channel.
  const gainNode = useRef(audioCtx.createGain());
  const dryGainNode = useRef(audioCtx.createGain());
  const wetGainNode = useRef(audioCtx.createGain());
  const convolver = useRef(audioCtx.createConvolver());

  // Helper: create impulse response for reverb.
  function createImpulseResponse(duration = 3, decay = 2, reverse = false) {
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * duration;
    const impulse = audioCtx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const impulseChannel = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const n = reverse ? length - i : i;
        impulseChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      }
    }
    return impulse;
  }

  // Pre-load a sample for channel 1.
  useEffect(() => {
    if (index === 0) {
      fetch('https://jmelvnsn.github.io/audio-mixer/acoustic_guitar.wav')
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
        .then(decodedData => {
          setBuffer(decodedData);
          console.log(`Pre-loaded sample for channel ${index + 1}`);
        })
        .catch(error => console.error('Error pre-loading sample:', error));
    }
  }, [audioCtx, index]);

  // Set up audio routing for reverb and connect directly to the destination.
  useEffect(() => {
    // Set the channel volume gain.
    gainNode.current.gain.value = gain;
    // Configure the reverb chain.
    convolver.current.buffer = createImpulseResponse(3, 2, false);
    dryGainNode.current.gain.value = 1 - mix;
    wetGainNode.current.gain.value = mix;

    try {
      gainNode.current.disconnect();
    } catch (e) {
      console.error(e);
    }
    // Route: source -> gainNode -> splits into dry and wet branches -> destination.
    gainNode.current.connect(dryGainNode.current);
    gainNode.current.connect(convolver.current);
    dryGainNode.current.connect(audioCtx.destination);
    convolver.current.connect(wetGainNode.current);
    wetGainNode.current.connect(audioCtx.destination);
  }, [audioCtx, mix]);

  // Update channel gain if prop changes.
  useEffect(() => {
    gainNode.current.gain.value = gain;
  }, [gain]);

  // Update reverb mix.
  useEffect(() => {
    dryGainNode.current.gain.value = 1 - mix;
    wetGainNode.current.gain.value = mix;
  }, [mix]);

  // Update playback rate when pitch changes.
  useEffect(() => {
    if (source) {
      source.playbackRate.value = pitch;
    }
  }, [pitch, source]);

  // Load an audio sample from a file.
  const loadSample = (file) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const arrayBuffer = e.target.result;
      audioCtx.decodeAudioData(arrayBuffer)
        .then(decodedData => {
          setBuffer(decodedData);
          console.log(`Loaded sample for channel ${index + 1}`);
        })
        .catch(error => console.error(error));
    };
    reader.readAsArrayBuffer(file);
  };

  // Play the loaded sample.
  const playSample = () => {
    if (!buffer) {
      alert(`No sample loaded for channel ${index + 1}`);
      return;
    }
    // Stop current source if playing.
    if (isPlaying && source) {
      try {
        source.stop();
      } catch (e) {
        console.error("Error stopping source", e);
      }
    }
    const newSource = audioCtx.createBufferSource();
    newSource.buffer = buffer;
    newSource.loop = loop;
    newSource.playbackRate.value = pitch;
    newSource.connect(gainNode.current);
    const offset = pauseTime || 0;
    newSource.start(0, offset);
    setStartTime(audioCtx.currentTime - offset);
    setSource(newSource);
    setIsPlaying(true);
    setPauseTime(0);
    // Ensure random mode is off when starting playback.
    if (randomIntervalRef.current) {
      clearInterval(randomIntervalRef.current);
      randomIntervalRef.current = null;
      setRandomActive(false);
    }
    newSource.onended = () => {
      setIsPlaying(false);
      setPauseTime(0);
      // Deactivate random mode when audio stops.
      if (randomIntervalRef.current) {
        clearInterval(randomIntervalRef.current);
        randomIntervalRef.current = null;
        setRandomActive(false);
      }
    };
  };

  // Pause playback.
  const pauseSample = () => {
    if (isPlaying && source) {
      try {
        source.stop();
      } catch (e) {
        console.error("Error stopping source", e);
      }
      setPauseTime(audioCtx.currentTime - startTime);
      setIsPlaying(false);
      // Deactivate random mode on pause.
      if (randomIntervalRef.current) {
        clearInterval(randomIntervalRef.current);
        randomIntervalRef.current = null;
        setRandomActive(false);
      }
    }
  };

  // Toggle random pitch modulation.
  const toggleRandom = () => {
    if (!isPlaying) return; // Only work while audio is playing.
    if (randomActive) {
      // Deactivate random mode.
      clearInterval(randomIntervalRef.current);
      randomIntervalRef.current = null;
      setRandomActive(false);
    } else {
      // Activate random mode.
      setRandomActive(true);
      randomIntervalRef.current = setInterval(() => {
        // Randomly pick one of the allowed values (0.5, 1, 1.5, or 2).
        const steps = [0.5, 1, 1.5, 2];
        const randomPitch = steps[Math.floor(Math.random() * steps.length)];
        setPitch(randomPitch);
      }, 200); // Update every 200ms.
    }
  };

  return (
    <div className="channel">
      <h2>Channel {index + 1}</h2>
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) {
            loadSample(file);
          }
        }}
      />
      <div className="playControl">
        <button type="button" onClick={playSample} className={isPlaying ? 'active' : ''}>
          PLAY
        </button>
        <button type="button" onClick={pauseSample}>STOP</button>
        <button type="button" onClick={toggleRandom} className="glitch {randomActive ? 'active' : ''}">
          GLITCH
        </button>
      </div>
      <label>
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => {
            setLoop(e.target.checked);
            if (source) {
              source.loop = e.target.checked;
            }
          }}
        />
        Loop
      </label>
      <br />
      {/* Tape image with rotation when playing */}
      <img
        src={tape}
        className={`tape ${isPlaying ? 'rotating' : ''}`}
        alt="Tape Reel"
      />
      <div className="pitchSlider">
        <span>1/2</span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.5"
          value={pitch}
          onChange={(e) => setPitch(parseFloat(e.target.value))}
          style={{ flexGrow: 1 }}
        />
        <span style={{ marginLeft: '8px' }}>2x</span>
      </div>
      {/* Reverb mix slider */}
      <img src={reverb} className="reverb" alt="Reverb" />
      <div className="reverbSlider">
        <span>Dry</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={mix}
          onChange={(e) => setMix(parseFloat(e.target.value))}
          style={{ flexGrow: 1 }}
        />
        <span style={{ marginLeft: '8px' }}>Wet</span>
      </div>
      {/* Channel gain slider */}
      <label className="gain">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={gain}
          onChange={(e) => onGainChange(index, parseFloat(e.target.value))}
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        />
      </label>
    </div>
  );
}

function App() {
  const [gains, setGains] = useState([1, 1, 1, 1]);
  const audioCtx = useRef(new (window.AudioContext || window.webkitAudioContext)());

  // Set up MIDI access to update gain values via MIDI Control Change messages.
  useEffect(() => {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then(
        (midiAccess) => {
          for (let input of midiAccess.inputs.values()) {
            input.onmidimessage = handleMIDIMessage;
          }
        },
        (err) => {
          console.error("MIDI Access Error:", err);
        }
      );
    } else {
      console.warn("Web MIDI API not supported in this browser.");
    }
  }, []);

  // MIDI handler: map CC messages (channels 0-3) to gain updates.
  const handleMIDIMessage = (event) => {
    const data = event.data;
    const status = data[0];
    const ccNumber = data[1];
    const value = data[2];
    if (status >= 176 && status <= 191 && ccNumber < 4) {
      const newGain = value / 127;
      setGains((prevGains) => {
        const updated = [...prevGains];
        updated[ccNumber] = newGain;
        return updated;
      });
    }
  };

  // Handle slider changes from each channel.
  const handleGainChange = (index, value) => {
    setGains((prevGains) => {
      const newGains = [...prevGains];
      newGains[index] = value;
      return newGains;
    });
  };

  return (
    <div className="App">
      <div id="channels" style={{ display: "flex" }}>
        {gains.map((gain, index) => (
          <Channel
            key={index}
            index={index}
            gain={gain}
            onGainChange={handleGainChange}
            audioCtx={audioCtx.current}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
