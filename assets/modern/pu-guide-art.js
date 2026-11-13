(() => {
  const guide = document.getElementById('beeGuide');
  const audio = document.getElementById('beeGuideAudio');
  const mouth = guide?.querySelector('.pu-guide-mouth');
  if (!audio || !mouth) return;

  const opening = mouth.querySelector('.pu-mouth-opening');
  const tongue = mouth.querySelector('.pu-mouth-tongue');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let context;
  let analyser;
  let samples;
  let frame = 0;
  let energy = 0;
  let lastFrame = 0;

  window.connectPuAudio = async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context ??= new AudioContext();
      if (context.state === 'suspended') await context.resume();
      if (context.state !== 'running' || analyser) return;
      const meter = context.createAnalyser();
      meter.fftSize = 256;
      meter.connect(context.destination);
      context.createMediaElementSource(audio).connect(meter);
      analyser = meter;
      samples = new Float32Array(meter.fftSize);
    } catch {
      // Playback still works when the browser does not expose a usable analyser.
    }
  };

  function render(now) {
    frame = 0;
    if (!shouldAnimate()) {
      mouth.style.opacity = '0';
      return;
    }
    if (now - lastFrame >= 1000 / 30 - 1) {
      lastFrame = now;
      let volume = 0;
      if (analyser && context.state === 'running') {
        analyser.getFloatTimeDomainData(samples);
        const sumSquares = samples.reduce((sum, sample) => sum + sample * sample, 0);
        volume = Math.min(1, Math.sqrt(sumSquares / samples.length) * 8);
      } else {
        volume = .12 + .27 * Math.abs(Math.sin(audio.currentTime * 17));
      }
      energy += (volume - energy) * (volume > energy ? .64 : .43);
      const depth = energy * 39;
      opening.setAttribute('d', `M624 618 C644 ${631 - depth} 693 ${631 - depth} 719 609 C720 625 700 ${654 + depth} 670 ${652 + depth} C648 ${652 + depth} 628 638 624 618Z`);
      tongue.setAttribute('d', `M646 ${650 + depth * .63} Q671 ${635 + depth * .61} 693 ${647 + depth * .69} Q668 ${657 + depth * .93} 646 ${650 + depth * .63}Z`);
      mouth.style.opacity = String(Math.min(1, Math.max(0, (energy - .06) * 10)));
    }
    frame = requestAnimationFrame(render);
  }

  function shouldAnimate() {
    return !reduced.matches && !document.hidden && !audio.paused && !audio.ended && guide.classList.contains('is-launched');
  }

  function sync() {
    if (shouldAnimate()) {
      if (!frame) frame = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      energy = 0;
      mouth.style.opacity = '0';
    }
  }

  for (const event of ['playing', 'pause', 'ended', 'emptied']) audio.addEventListener(event, sync);
  new MutationObserver(sync).observe(guide, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
})();
