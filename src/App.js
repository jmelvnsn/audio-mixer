import React, { useState, useRef, useEffect } from 'react';
import './App.css';


function Channel({ index, gain, onGainChange, audioCtx }) {
  const [buffer, setBuffer] = useState(null);
  const [source, setSource] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [pauseTime, setPauseTime] = useState(0);
  const [loop, setLoop] = useState(false);
  
  // New state for the reverb mix slider: 0 = 100% dry, 1 = 100% wet.
  // Defaulting to 0.3 (i.e. 70% dry, 30% wet).
  const [mix, setMix] = useState(0.3);

  // Create a gain node for channel volume (before effect splitting)
  const gainNode = useRef(audioCtx.createGain());
  // Create nodes for the reverb effect chain
  const dryGainNode = useRef(audioCtx.createGain());
  const wetGainNode = useRef(audioCtx.createGain());
  const convolver = useRef(audioCtx.createConvolver());

  // Helper function to create an impulse response for the convolver
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


  // Pre-load audio sample for Channel 1 from the public directory
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

  // On mount: set up the reverb chain and initialize gains based on the mix value.
  useEffect(() => {
    // Set the channel volume gain
    gainNode.current.gain.value = gain;
    // Set impulse response for the convolver
    convolver.current.buffer = createImpulseResponse(3, 2, false);
    // Initialize dry and wet gains based on the mix slider:
    // mix = 0 => dry 1, wet 0; mix = 1 => dry 0, wet 1.
    dryGainNode.current.gain.value = 1 - mix;
    wetGainNode.current.gain.value = mix;

    // Set up the audio routing:
    // Source -> gainNode -> splits into two branches:
    //   Dry: gainNode -> dryGainNode -> destination
    //   Wet: gainNode -> convolver -> wetGainNode -> destination
    try {
      gainNode.current.disconnect();
    } catch (e) {
      console.error(e);
    }
    gainNode.current.connect(dryGainNode.current);
    gainNode.current.connect(convolver.current);
    dryGainNode.current.connect(audioCtx.destination);
    convolver.current.connect(wetGainNode.current);
    wetGainNode.current.connect(audioCtx.destination);
  }, [audioCtx]);

  // Update the main channel gain if the prop changes.
  useEffect(() => {
    gainNode.current.gain.value = gain;
  }, [gain]);

  // Update the reverb mix whenever the mix state changes.
  useEffect(() => {
    dryGainNode.current.gain.value = 1 - mix;
    wetGainNode.current.gain.value = mix;
  }, [mix]);

  // Load an audio sample from a file (triggered by file input)
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

  // Play the loaded sample
  const playSample = () => {
    if (!buffer) {
      alert(`No sample loaded for channel ${index + 1}`);
      return;
    }
    // Stop current source if playing
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
    // Connect the source to the channel gain node (which splits into dry/wet)
    newSource.connect(gainNode.current);
    const offset = pauseTime || 0;
    newSource.start(0, offset);
    setStartTime(audioCtx.currentTime - offset);
    setSource(newSource);
    setIsPlaying(true);
    setPauseTime(0);
    newSource.onended = () => {
      setIsPlaying(false);
      setPauseTime(0);
    };
  };

  // Pause playback and store the current offset for resuming later
  const pauseSample = () => {
    if (isPlaying && source) {
      try {
        source.stop();
      } catch (e) {
        console.error("Error stopping source", e);
      }
      setPauseTime(audioCtx.currentTime - startTime);
      setIsPlaying(false);
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
      <button onClick={playSample}>Play</button>
      <button onClick={pauseSample}>Stop</button>
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
      {/* Combined reverb mix slider: horizontal, with "Dry" label on the left and "Wet" on the right */}
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
      {/* Vertical gain slider for channel volume */}
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

  // Set up MIDI access to update gain values via MIDI Control Change messages
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

  // MIDI handler: map CC messages (channels 0-3) to gain updates
  const handleMIDIMessage = (event) => {
    const data = event.data;
    const status = data[0];
    const ccNumber = data[1];
    const value = data[2];
    if (status >= 176 && status <= 191) {
      if (ccNumber >= 0 && ccNumber < 4) {
        const newGain = value / 127;
        setGains((prevGains) => {
          const updated = [...prevGains];
          updated[ccNumber] = newGain;
          return updated;
        });
      }
    }
  };

  // Handle slider changes from each channel
  const handleGainChange = (index, value) => {
    setGains((prevGains) => {
      const newGains = [...prevGains];
      newGains[index] = value;
      return newGains;
    });
  };

  return (
    <div className="App">
      <p>Channel 1 is preloaded with an acoustic guitar. <br/>You can demo by pressing play and/or selecting loop.<br/> Feel free to load your own samples.</p>
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
