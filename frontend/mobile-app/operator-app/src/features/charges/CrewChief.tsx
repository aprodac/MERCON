/**
 * The extra-charges assistant's character — the same Mercon brand tile with a
 * face as on the web dashboard, rebuilt for React Native: each face part is
 * its own animated layer (react-native-svg drawings inside Reanimated views),
 * so moods are just short sequences on shared values.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop, Circle, Line, Pattern, G, Text as SvgText } from 'react-native-svg';

export type CrewChiefMood = 'idle' | 'greet' | 'ask' | 'think' | 'happy' | 'thrilled' | 'nod' | 'oops' | 'sleep' | 'concerned';

export interface CrewChiefHandle {
  mood: (name: CrewChiefMood, next?: CrewChiefMood) => void;
  /** 0–1: warms the tile from coral toward gold, e.g. as a bill grows. */
  warm: (t: number) => void;
  /** A small "over here" hop — a new trip finished. */
  notice: () => void;
}

// Tile colour per mood — all warm, all in the brand family (same as the web).
const PAL: Record<CrewChiefMood, string> = {
  idle: '#fa634e', greet: '#ff7a59', ask: '#fa6a52', think: '#f68f4e', happy: '#ffaa4f',
  thrilled: '#ffbb4c', nod: '#f86a52', oops: '#ef5350', sleep: '#ab838b', concerned: '#f47a4c',
};
const INK = '#2d2b2c';
const BRAND_DOT = '#FA634E';

const lerpHex = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

const ease = Easing.out(Easing.quad);
const T = (v: number, duration = 250) => withTiming(v, { duration, easing: ease });

/** An absolutely-filled layer holding one face part, drawn in the 120×120 tile space. */
function Layer({ style, children }: { style?: any; children: React.ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 120 120">{children}</Svg>
    </Animated.View>
  );
}

/** Crew details on the character (Settings → Assistant on the web). */
export interface CrewChiefLook { cap: boolean; flag: boolean; headset: boolean }

/** Accessories reach outside the tile: drawn in a larger box, -4..136 × -40..124 of the tile's 120 space. */
const ACC = { x: -4, y: -40, w: 140, h: 164 };
const pct = (v: number, start: number, len: number) => `${((v - start) / len) * 100}%`;

function AccLayer({ k, style, children }: { k: number; style?: any; children: React.ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: ACC.x * k, top: ACC.y * k, width: ACC.w * k, height: ACC.h * k }, style]}>
      <Svg width="100%" height="100%" viewBox={`${ACC.x} ${ACC.y} ${ACC.w} ${ACC.h}`}>{children}</Svg>
    </Animated.View>
  );
}

const CrewChief = forwardRef<CrewChiefHandle, { size?: number; look?: CrewChiefLook }>(function CrewChief({ size = 56, look = { cap: true, flag: true, headset: true } }, ref) {
  const k = size / 120;
  const reduced = useReducedMotion();

  // Body
  const ty = useSharedValue(0), tx = useSharedValue(0), rot = useSharedValue(0), sx = useSharedValue(1), sy = useSharedValue(1), breathe = useSharedValue(1);
  const bg = useSharedValue(PAL.idle);
  // Face
  const fx = useSharedValue(0), fy = useSharedValue(0);
  const eyeSY = useSharedValue(1), eyeS = useSharedValue(1);
  const oOpen = useSharedValue(1), oHappy = useSharedValue(0), oShut = useSharedValue(0);
  const mSmile = useSharedValue(1), mGrin = useSharedValue(0), mO = useSharedValue(0), mFlat = useSharedValue(0), mWavy = useSharedValue(0), mSide = useSharedValue(0);
  const mScale = useSharedValue(1), blush = useSharedValue(0);
  // Extras
  const ringO = useSharedValue(0), ringS = useSharedValue(1);
  const d1 = useSharedValue(0), d2 = useSharedValue(0), d3 = useSharedValue(0);
  const zO = useSharedValue(0), zY = useSharedValue(0);
  // Accessories
  const capY = useSharedValue(0), capR = useSharedValue(0);
  const poleR = useSharedValue(0), wave = useSharedValue(0), droop = useSharedValue(0), checker = useSharedValue(0);
  const onAir = useSharedValue(0);

  const state = useRef({ current: 'idle' as CrewChiefMood, busy: false, sleeping: false, timers: [] as ReturnType<typeof setTimeout>[] });
  const later = (ms: number, fn: () => void) => { state.current.timers.push(setTimeout(fn, reduced ? 0 : ms)); };

  const eyes = (w: 'open' | 'happy' | 'shut') => {
    oOpen.value = T(w === 'open' ? 1 : 0, 150); oHappy.value = T(w === 'happy' ? 1 : 0, 150); oShut.value = T(w === 'shut' ? 1 : 0, 150);
  };
  const mouths: Record<string, SharedValue<number>> = { smile: mSmile, grin: mGrin, o: mO, flat: mFlat, wavy: mWavy, side: mSide };
  const mouth = (w: keyof typeof mouths) => Object.entries(mouths).forEach(([key, v]) => { v.value = T(key === w ? 1 : 0, 150); });

  const startBreathing = (slow = false) => {
    cancelAnimation(breathe);
    if (reduced) { breathe.value = 1; return; }
    breathe.value = withRepeat(withTiming(1.025, { duration: slow ? 4400 : 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
  };

  const neutral = () => {
    state.current.timers.forEach(clearTimeout); state.current.timers = [];
    [rot, ty, tx, mScale, d1, d2, d3, zO, zY].forEach((v) => cancelAnimation(v));
    rot.value = T(0, 300); ty.value = T(0, 300); tx.value = T(0, 300); sx.value = T(1); sy.value = T(1);
    d1.value = T(0, 150); d2.value = T(0, 150); d3.value = T(0, 150); zO.value = T(0, 150);
    ringO.value = 0; ringS.value = 1;
    fx.value = T(0, 400); fy.value = T(0, 400);
    if (state.current.sleeping) { state.current.sleeping = false; startBreathing(); }
    state.current.busy = false;
    eyes('open'); eyeSY.value = T(1); eyeS.value = T(1); mouth('smile'); mScale.value = T(1, 200); blush.value = T(0, 300);
  };

  const waveFlag = (speed = 900) => {
    cancelAnimation(wave);
    droop.value = T(0, 300);
    if (reduced) return;
    wave.value = withRepeat(withTiming(1, { duration: speed, easing: Easing.inOut(Easing.sin) }), -1, true);
  };
  const flick = () => { poleR.value = withSequence(T(-7, 160), withSpring(0, { damping: 5, stiffness: 140 })); };
  const flourish = (name: CrewChiefMood) => {
    const excited = name === 'happy' || name === 'thrilled' || name === 'greet';
    if (name === 'sleep') { cancelAnimation(wave); droop.value = T(1, 800); }
    else waveFlag(excited ? 220 : name === 'concerned' || name === 'oops' ? 450 : 900);
    if (name === 'happy' || name === 'thrilled') {
      checker.value = withSequence(T(1, 120), withDelay(name === 'thrilled' ? 2400 : 1800, T(0, 200)));
    }
    if (excited && !reduced) { flick(); if (name !== 'greet') later(1400, () => waveFlag(900)); }
    if (name === 'greet') { capR.value = withDelay(450, withSequence(T(-10, 200), withSpring(0, { damping: 6 }))); capY.value = withDelay(450, withSequence(T(-4 * k, 200), withSpring(0, { damping: 6 }))); }
    else if (name === 'happy') { capY.value = withSequence(T(-7 * k, 250), withSpring(0, { damping: 6 })); capR.value = withSequence(T(-8, 250), withSpring(0, { damping: 6 })); }
    else if (name === 'thrilled') { capY.value = withDelay(400, withSequence(T(-16 * k, 300), withSpring(0, { damping: 6 }))); capR.value = withDelay(400, withSequence(T(-18, 300), withSpring(0, { damping: 6 }))); }
    else if (name === 'sleep') { capY.value = T(5 * k, 1000); capR.value = T(8, 1000); }
    else { capY.value = T(0, 400); capR.value = T(0, 400); }
    onAir.value = T(name === 'ask' || name === 'think' ? 1 : 0, 200);
  };

  const setMood = useCallback((name: CrewChiefMood, next?: CrewChiefMood) => {
    neutral();
    flourish(name);
    state.current.current = name;
    bg.value = withTiming(PAL[name], { duration: name === 'sleep' ? 1200 : 600 });
    const settle = (ms: number) => { state.current.busy = true; later(ms, () => setMood(next || 'idle')); };
    switch (name) {
      case 'idle':
        if (!reduced) rot.value = withDelay(400, withRepeat(withTiming(1.5, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
        break;
      case 'greet':
        eyes('happy'); mouth('grin'); blush.value = T(0.9, 300);
        ty.value = withSequence(T(-12 * k, 280), withSpring(0, { damping: 7, stiffness: 180 }));
        rot.value = withDelay(450, withRepeat(withTiming(-7, { duration: 170 }), 4, true));
        settle(1300);
        break;
      case 'ask':
        fx.value = T(7 * k, 400); fy.value = T(-2 * k, 400); eyeS.value = T(1.04);
        rot.value = withSpring(5, { damping: 9 });
        if (!reduced) ty.value = withDelay(500, withRepeat(withTiming(-2 * k, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
        break;
      case 'think':
        fx.value = T(5 * k, 400); fy.value = T(-6 * k, 400); mouth('side'); rot.value = T(-4, 450);
        d1.value = withDelay(250, T(1)); d2.value = withDelay(430, T(1)); d3.value = withDelay(610, T(1));
        later(1700, () => { d1.value = T(0); d2.value = T(0); d3.value = T(0); fx.value = T(0, 400); fy.value = T(0, 400); mouth('smile'); rot.value = T(0, 400); });
        break;
      case 'happy':
        eyes('happy'); mouth('grin'); blush.value = T(0.9, 300);
        ringO.value = withSequence(withTiming(0.6, { duration: 1 }), withTiming(0, { duration: 800 }));
        ringS.value = withSequence(withTiming(1, { duration: 1 }), withTiming(1.45, { duration: 800, easing: ease }));
        ty.value = withSequence(T(-14 * k, 300), withSpring(0, { damping: 6, stiffness: 160 }));
        settle(1700);
        break;
      case 'thrilled':
        mouth('o'); blush.value = T(0.9, 300); eyeS.value = withSpring(1.18, { damping: 6 });
        later(500, () => {
          eyeS.value = T(1, 100); eyes('happy'); mouth('grin');
          ringO.value = withSequence(withTiming(0.7, { duration: 1 }), withTiming(0, { duration: 900 }));
          ringS.value = withSequence(withTiming(1, { duration: 1 }), withTiming(1.6, { duration: 900, easing: ease }));
          ty.value = withSequence(T(-16 * k, 240), T(0, 200), T(-10 * k, 200), withSpring(0, { damping: 6, stiffness: 160 }));
        });
        settle(2100);
        break;
      case 'nod':
        mouth('smile');
        ty.value = withRepeat(withTiming(4 * k, { duration: 140 }), 4, true);
        settle(800);
        break;
      case 'oops':
        mouth('wavy'); eyeSY.value = T(0.8);
        tx.value = withSequence(withRepeat(withTiming(-4 * k, { duration: 60 }), 6, true), T(0, 100));
        settle(1500);
        break;
      case 'concerned':
        mouth('flat'); eyeSY.value = T(0.85);
        if (!reduced) rot.value = withRepeat(withSequence(T(-3, 250), T(3, 250), T(0, 250), withDelay(2400, T(0, 1))), -1);
        break;
      case 'sleep':
        state.current.sleeping = true;
        eyes('shut'); mouth('o'); fy.value = T(3 * k, 600); rot.value = T(4, 900); ty.value = T(2 * k, 900);
        startBreathing(true);
        if (!reduced) {
          mScale.value = withRepeat(withTiming(0.75, { duration: 2200 }), -1, true);
          zO.value = withRepeat(withSequence(withTiming(1, { duration: 1600 }), withTiming(0, { duration: 1600 })), -1);
          zY.value = withRepeat(withSequence(withTiming(-10 * k, { duration: 1600 }), withTiming(0, { duration: 1600 })), -1);
        }
        break;
    }
  }, [k, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Breathing, blinking and the odd glance run on their own.
  useEffect(() => {
    startBreathing();
    waveFlag();
    if (reduced) return;
    let blinkT: ReturnType<typeof setTimeout>;
    let habitT: ReturnType<typeof setTimeout>;
    const blink = () => {
      const s = state.current;
      if (!s.sleeping) {
        const back = s.current === 'oops' || s.current === 'concerned' ? 0.82 : 1;
        eyeSY.value = withSequence(withTiming(0.12, { duration: 70 }), withTiming(back, { duration: 120 }));
      }
      blinkT = setTimeout(blink, 2500 + Math.random() * 3500);
    };
    const habit = () => {
      const s = state.current;
      if (!s.busy && !s.sleeping && (s.current === 'idle' || s.current === 'ask')) {
        if (Math.random() < 0.5) {
          fx.value = withSequence(T(-7 * k, 300), withDelay(400, T(7 * k, 400)), withDelay(400, T(s.current === 'ask' ? 7 * k : 0, 400)));
        } else {
          sy.value = withSequence(T(1.08, 450), withSpring(1, { damping: 5 }));
          sx.value = withSequence(T(0.95, 450), withSpring(1, { damping: 5 }));
        }
      }
      habitT = setTimeout(habit, 8000 + Math.random() * 8000);
    };
    blinkT = setTimeout(blink, 1800);
    habitT = setTimeout(habit, 9000);
    return () => { clearTimeout(blinkT); clearTimeout(habitT); state.current.timers.forEach(clearTimeout); };
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    mood: setMood,
    warm: (t) => {
      const s = state.current;
      if (s.current === 'oops' || s.sleeping) return;
      const base = PAL[s.current === 'think' ? 'think' : s.current === 'ask' ? 'ask' : 'idle'];
      bg.value = withTiming(lerpHex(base, PAL.happy, Math.max(0, Math.min(1, t)) * 0.75), { duration: 500 });
      if (!s.busy && !reduced && t > 0) {
        ty.value = withSequence(T(-4 * k, 120), withSpring(0, { damping: 6 }));
        mouth('grin'); later(700, () => { if (!state.current.busy) mouth('smile'); });
      }
    },
    notice: () => {
      if (reduced || state.current.busy) return;
      if (state.current.sleeping) setMood('idle');
      eyeS.value = withSequence(T(1.12, 200), withDelay(900, T(1, 200)));
      ty.value = withSequence(T(-10 * k, 220), withSpring(0, { damping: 6 }), T(-6 * k, 180), withSpring(0, { damping: 6 }));
    },
  }), [setMood, k, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${rot.value}deg` }, { scaleX: sx.value }, { scaleY: sy.value * breathe.value }],
  }));
  const tileStyle = useAnimatedStyle(() => ({ backgroundColor: bg.value, shadowColor: bg.value }));
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateX: fx.value }, { translateY: fy.value }] }));
  const eyesOpenStyle = useAnimatedStyle(() => ({ opacity: oOpen.value, transform: [{ scale: eyeS.value }, { scaleY: eyeSY.value }] }));
  const op = (v: SharedValue<number>) => useAnimatedStyle(() => ({ opacity: v.value })); // eslint-disable-line react-hooks/rules-of-hooks
  const sHappy = op(oHappy), sShut = op(oShut), sBlush = op(blush);
  const sSmile = op(mSmile), sGrin = op(mGrin), sO = op(mO), sFlat = op(mFlat), sWavy = op(mWavy), sSide = op(mSide);
  const sD1 = op(d1), sD2 = op(d2), sD3 = op(d3);
  const mouthStyle = useAnimatedStyle(() => ({ transform: [{ scale: mScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ringO.value, transform: [{ scale: ringS.value }], borderColor: bg.value }));
  const zStyle = useAnimatedStyle(() => ({ opacity: zO.value, transform: [{ translateY: zY.value }] }));
  const dotColor = useAnimatedStyle(() => ({ backgroundColor: bg.value }));
  const capStyle = useAnimatedStyle(() => ({ transform: [{ translateY: capY.value }, { rotate: `${capR.value}deg` }] }));
  const poleStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${poleR.value}deg` }] }));
  const pennantStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${droop.value * 68}deg` }, { skewY: `${(wave.value - 0.5) * 14 * (1 - droop.value)}deg` }, { scaleX: 1 - wave.value * 0.08 - droop.value * 0.35 }],
  }));
  const checkerStyle = useAnimatedStyle(() => ({ opacity: checker.value }));
  const onAirStyle = useAnimatedStyle(() => ({ opacity: onAir.value }));

  const tile = 100 * k, inset = 10 * k;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Animated.View style={[styles.ring, { left: inset, top: inset, width: tile, height: tile, borderRadius: tile / 2 }, ringStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: ['50%', '92%', 0] }, bodyStyle]}>
        <Animated.View style={[styles.tile, { left: inset, top: inset, width: tile, height: tile, borderRadius: 34 * k }, tileStyle]}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="ccLight" x1="0" y1="0" x2="0.35" y2="1">
                <Stop offset="0" stopColor="#fff" stopOpacity={0.38} />
                <Stop offset="0.55" stopColor="#fff" stopOpacity={0} />
                <Stop offset="1" stopColor="#000" stopOpacity={0.1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" rx="34" fill="url(#ccLight)" />
            <Rect x="0.75" y="0.75" width="98.5" height="98.5" rx="33.25" fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={1.5} />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, faceStyle]}>
          <Layer style={sBlush}>
            <Ellipse cx="36" cy="74" rx="7" ry="4" fill="#ffd0c4" /><Ellipse cx="84" cy="74" rx="7" ry="4" fill="#ffd0c4" />
          </Layer>
          <Layer style={[{ transformOrigin: ['50%', '46.7%', 0] }, eyesOpenStyle]}>
            <Rect x="40" y="45" width="11" height="22" rx="5.5" fill={INK} />
            <Rect x="69" y="45" width="11" height="22" rx="5.5" fill={INK} />
            <Circle cx="48" cy="50" r="2" fill="#fff" opacity={0.55} /><Circle cx="77" cy="50" r="2" fill="#fff" opacity={0.55} />
          </Layer>
          <Layer style={sHappy}>
            <Path d="M39 61 Q45.5 49 52 61" stroke={INK} strokeWidth={6} strokeLinecap="round" fill="none" />
            <Path d="M68 61 Q74.5 49 81 61" stroke={INK} strokeWidth={6} strokeLinecap="round" fill="none" />
          </Layer>
          <Layer style={sShut}>
            <Path d="M39 60 Q45.5 64 52 60" stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
            <Path d="M68 60 Q74.5 64 81 60" stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
          </Layer>
          <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: ['50%', '65.8%', 0] }, mouthStyle]}>
            <Layer style={sSmile}><Path d="M53 77 Q60 82 67 77" stroke={INK} strokeWidth={3.5} strokeLinecap="round" fill="none" /></Layer>
            <Layer style={sGrin}><Path d="M51 75 Q60 87 69 75 Z" fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" /></Layer>
            <Layer style={sO}><Ellipse cx="60" cy="79" rx="3.6" ry="4.2" fill={INK} /></Layer>
            <Layer style={sFlat}><Path d="M54 79 L66 79" stroke={INK} strokeWidth={3.5} strokeLinecap="round" /></Layer>
            <Layer style={sWavy}><Path d="M52 80 Q55 77 58 80 T64 80 T68 79" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" /></Layer>
            <Layer style={sSide}><Path d="M60 79 Q65 81 69 77" stroke={INK} strokeWidth={3.5} strokeLinecap="round" fill="none" /></Layer>
          </Animated.View>
        </Animated.View>

        {look.flag && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transformOrigin: [`${(99 / 120) * 100}%`, `${(22 / 120) * 100}%`, 0] }, poleStyle]}>
            <AccLayer k={k}>
              <Line x1="99" y1="22" x2="108" y2="-30" stroke="#3E3C3D" strokeWidth={2.2} strokeLinecap="round" />
            </AccLayer>
            <AccLayer k={k} style={[{ transformOrigin: [pct(108, ACC.x, ACC.w), pct(-22, ACC.y, ACC.h), 0] }, pennantStyle]}>
              <Defs>
                <LinearGradient id="ccPennant" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FF8B72" /><Stop offset="1" stopColor="#FA634E" />
                </LinearGradient>
                <Pattern id="ccChecker" width="6" height="6" patternUnits="userSpaceOnUse">
                  <Rect width="6" height="6" fill="#fff" /><Rect width="3" height="3" fill={INK} /><Rect x="3" y="3" width="3" height="3" fill={INK} />
                </Pattern>
              </Defs>
              <Path d="M108 -29 Q120 -29 133 -22 Q120 -15 108 -15 Z" fill="url(#ccPennant)" />
              <Path d="M108 -24 Q118 -24.5 126 -22" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.7} />
            </AccLayer>
            <AccLayer k={k} style={[{ transformOrigin: [pct(108, ACC.x, ACC.w), pct(-22, ACC.y, ACC.h), 0] }, pennantStyle, checkerStyle]}>
              <Path d="M108 -29 Q120 -29 133 -22 Q120 -15 108 -15 Z" fill="url(#ccChecker)" />
            </AccLayer>
            <AccLayer k={k}><Circle cx="108" cy="-30.5" r="2.4" fill={BRAND_DOT} /></AccLayer>
          </Animated.View>
        )}

        {look.cap && (
          <AccLayer k={k} style={[{ transformOrigin: [pct(60, ACC.x, ACC.w), pct(30, ACC.y, ACC.h), 0] }, capStyle]}>
            <Defs>
              <LinearGradient id="ccCap" x1="0" y1="0" x2="0.3" y2="1">
                <Stop offset="0" stopColor="#555153" /><Stop offset="1" stopColor={INK} />
              </LinearGradient>
            </Defs>
            <G rotation={-6} origin="60, 28">
              <Ellipse cx="62" cy="33" rx="34" ry="3.5" fill="#000" opacity={0.14} />
              <Path d="M27 29 C26 7 41 -5 60 -5 C79 -5 94 7 94 29 Q60 21 27 29 Z" fill="url(#ccCap)" />
              <Path d="M60 -5 Q49 9 45 27" stroke="#fff" strokeWidth={1.2} opacity={0.14} fill="none" />
              <Path d="M60 -5 Q71 9 75 27" stroke="#fff" strokeWidth={1.2} opacity={0.14} fill="none" />
              <Rect x="49" y="7" width="22" height="13" rx="4" fill={BRAND_DOT} />
              <SvgText x="60" y="17.5" textAnchor="middle" fontWeight="800" fontSize="10" fill="#fff">M</SvgText>
              <Circle cx="60" cy="-5" r="2.6" fill="#3E3C3D" />
              <Path d="M22 29 Q60 19 98 29 Q105 35 96 38 Q60 29 24 38 Q15 35 22 29 Z" fill="#3E3C3D" />
              <Path d="M28 31 Q60 23 92 31" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.16} fill="none" />
            </G>
          </AccLayer>
        )}

        {look.headset && (
          <>
            <AccLayer k={k}>
              <Path d="M17 54 Q16 6 60 5 Q104 6 103 54" stroke="#3E3C3D" strokeWidth={5} strokeLinecap="round" fill="none" />
              <Rect x="8" y="44" width="13" height="24" rx="6.5" fill="#3E3C3D" />
              <Rect x="99" y="44" width="13" height="24" rx="6.5" fill="#3E3C3D" />
              <Rect x="11" y="49" width="5" height="14" rx="2.5" fill={BRAND_DOT} opacity={0.9} />
              <Rect x="104" y="49" width="5" height="14" rx="2.5" fill={BRAND_DOT} opacity={0.9} />
              <Path d="M14 66 Q17 86 40 85" stroke="#3E3C3D" strokeWidth={3} strokeLinecap="round" fill="none" />
              <Rect x="38" y="81" width="9" height="7" rx="3.5" fill={INK} />
            </AccLayer>
            <AccLayer k={k} style={onAirStyle}><Circle cx="105.5" cy="44" r="2" fill="#5EE38F" /></AccLayer>
          </>
        )}
      </Animated.View>
      {/* thinking dots + sleepy z, outside the tile's top-right */}
      <Animated.View style={[styles.dot, { left: (look.flag ? 18 : 96) * k, top: 16 * k, width: 6 * k, height: 6 * k }, dotColor, sD1]} />
      <Animated.View style={[styles.dot, { left: (look.flag ? 9 : 105) * k, top: 10 * k, width: 6 * k, height: 6 * k }, dotColor, sD2]} />
      <Animated.View style={[styles.dot, { left: (look.flag ? 0 : 114) * k, top: 4 * k, width: 6 * k, height: 6 * k }, dotColor, sD3]} />
      <Animated.View style={[{ position: 'absolute', left: 100 * k, top: -2 * k }, zStyle]}>
        <Text style={{ fontSize: Math.max(10, 15 * k), fontWeight: '700', color: '#a8a3a5' }}>z</Text>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: { position: 'absolute', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  ring: { position: 'absolute', borderWidth: 2 },
  dot: { position: 'absolute', borderRadius: 99 },
});

export default CrewChief;
