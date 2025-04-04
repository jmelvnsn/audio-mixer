import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function Channel({ index, gain, onGainChange, audioCtx }) {
  const [buffer, setBuffer] = useState(null);
  const [source, setSource] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [pauseTime, setPauseTime] = useState(0);
  const [loop, setLoop] = useState(false);

  // Create a gain node for this channel
  const gainNode = useRef(audioCtx.createGain());

  // On mount, connect the gain node to the destination and set initial gain
  useEffect(() => {
    gainNode.current.connect(audioCtx.destination);
    gainNode.current.gain.value = gain;
  }, [audioCtx, gain]);

  // Update the gain node if the gain prop changes
  useEffect(() => {
    gainNode.current.gain.value = gain;
  }, [gain]);

  // Load an audio sample from a file
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
      <button onClick={pauseSample}>Pause</button>
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
      <label className="gain">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={gain}
          onChange={(e) => onGainChange(index, parseFloat(e.target.value))}
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
