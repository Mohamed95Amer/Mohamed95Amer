/*
 * GetGold.ae reel: asset slots.
 *
 * Drop the supplied files into assets/slots/ and set the paths below.
 * A slot left as null renders as a clearly labelled placeholder, in the
 * preview and in the exported MP4 alike.
 */
window.REEL_ASSETS = {
  // Official logo (SVG preferred, or a transparent PNG). While null, the reel
  // shows the "GET GOLD" wordmark as the website header sets it, in a serif.
  logo: null, // e.g. "assets/slots/logo.svg"

  // Gold ring product photo for scenes 1 and 2. Square crops best.
  ring: null, // e.g. "assets/slots/ring.png"
  // "contain" for a transparent cut-out, "cover" for a photo with a background.
  ringFit: "cover",

  // Mobile screenshot of the GetGold marketplace (portrait). If it is taller
  // than the phone screen, scene 3 scrolls it once, gently.
  screenshot: null, // e.g. "assets/slots/marketplace-mobile.png"

  // Optional audio. Music replaces the built-in instrumental; the voiceover
  // is placed at voiceoverStart seconds and the music dips under it.
  music: null, // e.g. "assets/slots/music.mp3"
  voiceover: null, // e.g. "assets/slots/voiceover.wav"
  voiceoverStart: 1.0,
};
