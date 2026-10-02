import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * The extra-charges assistant's character: the Mercon brand tile with a face.
 * It shows how it feels through its eyes, mouth, motion and colour — never
 * words. The parent drives it through the handle (mood / warm / lookAt /
 * notice); breathing, blinking, cursor-following and small idle habits run
 * on their own.
 */

export type CrewChiefMood =
  | 'idle' | 'greet' | 'ask' | 'think' | 'happy' | 'thrilled' | 'nod' | 'oops' | 'sleep' | 'concerned';

export interface CrewChiefHandle {
  /** Switch mood; one-off moods (greet, happy, thrilled, nod, oops) then settle into `next`. */
  mood: (name: CrewChiefMood, next?: CrewChiefMood) => void;
  /** 0–1: how warm (coral → gold) the tile glows, e.g. as a bill total grows. */
  warm: (t: number) => void;
  /** Look at an element (or follow the cursor again with null). */
  lookAt: (el: Element | null) => void;
  /** A small "hey, over here" hop — used when a new trip finishes. */
  notice: () => void;
}

// [top, middle, bottom, glow] — all warm, all in the brand family.
const PAL: Record<CrewChiefMood, [string, string, string, string]> = {
  idle:      ['#ff8b72', '#fa634e', '#e94f3b', 'rgba(250,99,78,.30)'],
  greet:     ['#ffb08a', '#ff7a59', '#f2583f', 'rgba(255,122,89,.45)'],
  ask:       ['#ff9a7c', '#fa6a52', '#ea5440', 'rgba(250,106,82,.34)'],
  think:     ['#ffbd7a', '#f68f4e', '#e2703c', 'rgba(246,143,78,.34)'],
  happy:     ['#ffd47e', '#ffaa4f', '#f5823e', 'rgba(255,170,79,.50)'],
  thrilled:  ['#ffe596', '#ffbb4c', '#ff8a3d', 'rgba(255,187,76,.60)'],
  nod:       ['#ff9478', '#f86a52', '#e65440', 'rgba(248,106,82,.30)'],
  oops:      ['#ff8a80', '#ef5350', '#d63c3c', 'rgba(239,83,80,.38)'],
  sleep:     ['#cfa9ad', '#ab838b', '#8b6871', 'rgba(139,104,113,.22)'],
  concerned: ['#ffa77a', '#f47a4c', '#de5f3a', 'rgba(244,122,76,.36)'],
};

const ONE_OFF: CrewChiefMood[] = ['greet', 'happy', 'thrilled', 'nod', 'oops'];

interface Props {
  size?: number;
  className?: string;
}

const CrewChief = forwardRef<CrewChiefHandle, Props>(function CrewChief({ size = 64, className }, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  const api = useRef<CrewChiefHandle>({ mood: () => {}, warm: () => {}, lookAt: () => {}, notice: () => {} });

  useImperativeHandle(ref, () => ({
    mood: (n, next) => api.current.mood(n, next),
    warm: (t) => api.current.warm(t),
    lookAt: (el) => api.current.lookAt(el),
    notice: () => api.current.notice(),
  }), []);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const D = (d: number) => (RM ? 0 : d);
    const q = (s: string) => svg.querySelectorAll(s);
    const el = (id: string) => svg.querySelector(`[data-cc="${id}"]`) as SVGElement;

    const ctx = gsap.context(() => {
      const bodyT = el('body'), face = el('face'), eyesOpen = el('eyesOpen'), ring = el('ring'), mouthG = el('mouth'), zz = el('zz');
      const dots = q('[data-cc="dots"] circle');
      gsap.set(bodyT, { svgOrigin: '60 110' });
      gsap.set(face, { svgOrigin: '60 60' });
      gsap.set(eyesOpen, { svgOrigin: '60 56' });
      gsap.set(ring, { svgOrigin: '60 60' });
      gsap.set(mouthG, { svgOrigin: '60 79' });
      gsap.set(dots, { opacity: 0 });

      const EYES = ['eyesOpen', 'eyesHappy', 'eyesShut'];
      const MOUTHS = ['mSmile', 'mGrin', 'mO', 'mFlat', 'mWavy', 'mSide'];
      const eyes = (w: string) => EYES.forEach((id) => gsap.to(el(id), { opacity: id === w ? 1 : 0, duration: D(0.15) }));
      const mouth = (w: string) => MOUTHS.forEach((id) => gsap.to(el(id), { opacity: id === w ? 1 : 0, duration: D(0.15) }));
      const blush = (on: boolean) => gsap.to(q('[data-cc="blush"]'), { opacity: on ? 0.9 : 0, duration: D(0.3) });
      // Without brows, the eyes carry the feeling: squashed = worried, tall = alert.
      const eyeShape = (scaleY: number, y = 0) => gsap.to(eyesOpen, { scaleY, y, duration: D(0.25), ease: 'power2.out' });

      function tint(p: string[], dur = 0.6) {
        const d = D(dur);
        gsap.to(el('s0'), { attr: { 'stop-color': p[0] }, duration: d, ease: 'sine.inOut' });
        gsap.to(el('s1'), { attr: { 'stop-color': p[1] }, duration: d, ease: 'sine.inOut' });
        gsap.to(el('s2'), { attr: { 'stop-color': p[2] }, duration: d, ease: 'sine.inOut' });
        gsap.to(svg, { '--cc-glow': p[3], duration: d, ease: 'sine.inOut' });
        gsap.to(ring, { attr: { stroke: p[1] }, duration: d });
        gsap.to(el('dots'), { attr: { fill: p[1] }, duration: d });
      }
      const shimmer = () => {
        if (RM) return;
        gsap.fromTo(el('shimmer'), { x: 0, opacity: 1 }, { x: 170, duration: 0.9, ease: 'power2.inOut', onComplete: () => { gsap.set(el('shimmer'), { opacity: 0 }); } });
      };

      let sleeping = false;
      let busy = false;
      let lookLock = false;
      let current: CrewChiefMood = 'idle';
      let prev: CrewChiefMood = 'idle';
      let moodTl: gsap.core.Timeline | null = null;

      const breathe = gsap.to(bodyT, { scaleY: 1.025, scaleX: 0.99, duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      if (RM) breathe.pause();

      const blink = (double = false) => {
        if (sleeping || RM) return;
        const tl = gsap.timeline()
          .to(eyesOpen, { scaleY: 0.12, duration: 0.07, ease: 'power2.in' })
          .to(eyesOpen, { scaleY: current === 'oops' || current === 'concerned' ? 0.8 : 1, duration: 0.12, ease: 'power2.out' });
        if (double) tl.to(eyesOpen, { scaleY: 0.12, duration: 0.07 }, '+=0.08').to(eyesOpen, { scaleY: 1, duration: 0.12 });
      };
      const blinkLoop = () => { blink(Math.random() < 0.2); gsap.delayedCall(2.5 + Math.random() * 3.5, blinkLoop); };
      gsap.delayedCall(1.8, blinkLoop);

      const fx = gsap.quickTo(face, 'x', { duration: 0.45, ease: 'power3' });
      const fy = gsap.quickTo(face, 'y', { duration: 0.45, ease: 'power3' });
      const lookToward = (px: number, py: number, k = 1) => {
        const r = svg.getBoundingClientRect();
        const dx = Math.max(-1, Math.min(1, (px - (r.left + r.width / 2)) / 320));
        const dy = Math.max(-1, Math.min(1, (py - (r.top + r.height / 2)) / 280));
        fx(dx * 7 * k); fy(dy * 5 * k);
      };
      const onMove = (e: PointerEvent) => { if (!lookLock && !RM) lookToward(e.clientX, e.clientY); };
      window.addEventListener('pointermove', onMove);
      const look = (x: number, y: number) => { lookLock = true; fx(x); fy(y); };
      const freeLook = () => { lookLock = false; };
      const restLook = () => (current === 'ask' ? look(7, 1) : freeLook());

      function neutral() {
        gsap.killTweensOf([bodyT, ring, ...dots, zz, mouthG]);
        gsap.to(bodyT, { rotation: 0, y: 0, x: 0, scaleX: 1, duration: D(0.3), ease: 'power2.out' });
        gsap.to(mouthG, { scale: 1, duration: D(0.2) });
        gsap.to(dots, { opacity: 0, duration: D(0.15) });
        gsap.to(zz, { opacity: 0, duration: D(0.15) });
        gsap.set(ring, { opacity: 0, scale: 1 });
        if (sleeping) { sleeping = false; breathe.timeScale(1); }
        freeLook(); busy = false;
        eyes('eyesOpen'); eyeShape(1); mouth('mSmile'); blush(false);
      }

      const moods: Record<CrewChiefMood, (next?: CrewChiefMood) => gsap.core.Timeline> = {
        idle: () => gsap.timeline({ repeat: -1, yoyo: true, delay: 0.4 }).to(bodyT, { rotation: 1.5, duration: 2.6, ease: 'sine.inOut' }),
        greet: (next) => {
          busy = true; eyes('eyesHappy'); mouth('mGrin'); blush(true);
          return gsap.timeline({ onComplete: () => setMood(next || 'idle') })
            .fromTo(bodyT, { y: 0 }, { y: -12, scaleY: 1.05, duration: 0.28, ease: 'power2.out' })
            .to(bodyT, { y: 0, scaleY: 1, duration: 0.45, ease: 'bounce.out' })
            .to(bodyT, { rotation: -7, duration: 0.17, ease: 'sine.inOut', yoyo: true, repeat: 3 }, '-=0.15')
            .to({}, { duration: 0.25 });
        },
        ask: () => {
          look(7, 1); mouth('mSmile'); eyeShape(1.06);
          return gsap.timeline()
            .to(bodyT, { rotation: 5, duration: 0.5, ease: 'back.out(2)' })
            .to(bodyT, { y: -2, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        },
        think: () => {
          look(5, -6); mouth('mSide');
          return gsap.timeline()
            .to(bodyT, { rotation: -4, duration: 0.45, ease: 'power2.out' })
            .to(dots, { opacity: 1, duration: 0.25, stagger: 0.18 }, '-=0.2')
            .to(dots, { opacity: 0, duration: 0.3, stagger: 0.1 }, '+=0.9')
            .add(() => { freeLook(); mouth('mSmile'); })
            .to(bodyT, { rotation: 0, duration: 0.4 }, '<');
        },
        happy: (next) => {
          busy = true; eyes('eyesHappy'); mouth('mGrin'); blush(true);
          return gsap.timeline({ onComplete: () => setMood(next || 'idle') })
            .fromTo(ring, { opacity: 0.6, scale: 1 }, { opacity: 0, scale: 1.45, duration: 0.8, ease: 'power2.out' })
            .to(bodyT, { y: -14, scaleY: 1.05, duration: 0.3, ease: 'power2.out' }, 0)
            .to(bodyT, { y: 0, scaleY: 1, duration: 0.5, ease: 'bounce.out' })
            .to({}, { duration: 0.6 });
        },
        thrilled: (next) => {
          busy = true; eyes('eyesOpen'); mouth('mO'); blush(true);
          return gsap.timeline({ onComplete: () => setMood(next || 'idle') })
            .to(eyesOpen, { scale: 1.18, duration: 0.18, ease: 'back.out(3)' })
            .add(() => { eyes('eyesHappy'); mouth('mGrin'); }, '+=0.35')
            .to(eyesOpen, { scale: 1, duration: 0.1 })
            .fromTo(ring, { opacity: 0.7, scale: 1 }, { opacity: 0, scale: 1.6, duration: 0.9, ease: 'power2.out' }, '<')
            .to(bodyT, { y: -16, scaleY: 1.06, duration: 0.24, ease: 'power2.out' }, '<')
            .to(bodyT, { y: 0, scaleY: 0.95, duration: 0.2, ease: 'power2.in' })
            .to(bodyT, { y: -10, scaleY: 1.04, duration: 0.2, ease: 'power2.out' })
            .to(bodyT, { y: 0, scaleY: 1, duration: 0.45, ease: 'bounce.out' })
            .to({}, { duration: 0.5 });
        },
        nod: (next) => {
          busy = true; mouth('mSmile');
          return gsap.timeline({ onComplete: () => setMood(next || 'idle') })
            .to(bodyT, { y: 4, duration: 0.14, yoyo: true, repeat: 3, ease: 'sine.inOut' })
            .to({}, { duration: 0.2 });
        },
        oops: (next) => {
          busy = true; mouth('mWavy'); eyeShape(0.8, 2);
          return gsap.timeline({ onComplete: () => setMood(next || 'idle') })
            .to(bodyT, { x: -4, duration: 0.06, yoyo: true, repeat: 5, ease: 'sine.inOut' })
            .to(bodyT, { x: 0, duration: 0.1 })
            .to({}, { duration: 0.9 });
        },
        // Trips have waited a while: a little restless, never alarming.
        concerned: () => {
          mouth('mFlat'); eyeShape(0.85, 1);
          return gsap.timeline({ repeat: -1, repeatDelay: 2.4 })
            .to(bodyT, { rotation: -3, duration: 0.25, ease: 'sine.inOut' })
            .to(bodyT, { rotation: 3, duration: 0.25, ease: 'sine.inOut' })
            .to(bodyT, { rotation: 0, duration: 0.25, ease: 'sine.inOut' });
        },
        sleep: () => {
          sleeping = true; eyes('eyesShut'); mouth('mO'); look(0, 3);
          breathe.timeScale(0.5);
          gsap.to(mouthG, { scale: 0.75, duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
          return gsap.timeline()
            .to(bodyT, { rotation: 4, y: 2, duration: 0.9, ease: 'sine.inOut' })
            .fromTo(zz, { opacity: 0, y: 4, x: 0 }, { opacity: 1, y: -10, x: 4, duration: 1.6, ease: 'sine.out', repeat: -1, repeatDelay: 0.4, yoyo: true });
        },
      };

      function setMood(name: CrewChiefMood, next?: CrewChiefMood) {
        if (moodTl) moodTl.kill();
        neutral();
        tint(PAL[name], ['happy', 'thrilled', 'greet'].includes(prev) ? 1.4 : name === 'sleep' ? 1.2 : 0.5);
        if (name === 'thrilled' || name === 'happy') gsap.delayedCall(name === 'thrilled' ? 0.45 : 0.1, shimmer);
        prev = name; current = name;
        moodTl = moods[name](ONE_OFF.includes(name) ? next : undefined);
        if (RM) moodTl.progress(1).pause();
      }

      // Little habits while it waits.
      const habits = [
        () => { look(-7, 0); gsap.delayedCall(0.7, () => look(7, -1)); gsap.delayedCall(1.4, restLook); },
        () => gsap.timeline()
          .to(bodyT, { scaleY: 1.09, scaleX: 0.95, duration: 0.45, ease: 'power2.out' })
          .add(() => eyes('eyesShut'), '<')
          .to(bodyT, { scaleY: 1, scaleX: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' }, '+=0.3')
          .add(() => eyes('eyesOpen')),
        () => gsap.timeline()
          .add(() => { mouth('mO'); eyes('eyesShut'); })
          .to(mouthG, { scale: 1.6, duration: 0.6, ease: 'sine.inOut' })
          .to(mouthG, { scale: 1, duration: 0.4 }, '+=0.3')
          .add(() => { mouth('mSmile'); eyes('eyesOpen'); }),
        () => blink(true),
      ];
      const habitLoop = () => gsap.delayedCall(8 + Math.random() * 8, () => {
        if (!busy && !sleeping && !RM && (current === 'idle' || current === 'ask')) habits[Math.floor(Math.random() * habits.length)]();
        habitLoop();
      });
      habitLoop();

      // Hover perks it up; asleep, it opens one eye. Press squishes.
      const onEnter = () => {
        if (busy || RM) return;
        if (sleeping) {
          eyes('eyesOpen'); gsap.set(el('eyeL'), { opacity: 0 });
          gsap.delayedCall(0.9, () => { gsap.set(el('eyeL'), { opacity: 1 }); if (sleeping) eyes('eyesShut'); });
          return;
        }
        gsap.timeline()
          .to(bodyT, { scaleY: 1.06, scaleX: 0.97, duration: 0.18, ease: 'power2.out' })
          .to(bodyT, { scaleY: 1, scaleX: 1, duration: 0.5, ease: 'elastic.out(1, 0.45)' });
        eyeShape(1.1);
        gsap.delayedCall(0.5, () => { if (!busy) eyeShape(current === 'concerned' ? 0.85 : current === 'ask' ? 1.06 : 1, current === 'concerned' ? 1 : 0); });
      };
      const onDown = () => {
        if (RM) return;
        gsap.to(bodyT, { scaleY: 0.9, scaleX: 1.06, duration: 0.1, ease: 'power2.out', onComplete: () => { gsap.to(bodyT, { scaleY: 1, scaleX: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' }); } });
      };
      svg.addEventListener('pointerenter', onEnter);
      svg.addEventListener('pointerdown', onDown);

      api.current = {
        mood: setMood,
        warm: (t) => {
          if (current === 'oops' || sleeping) return;
          const base = PAL[current === 'ask' ? 'ask' : current === 'think' ? 'think' : 'idle'];
          const k = Math.max(0, Math.min(1, t)) * 0.75;
          tint(base.map((c, i) => gsap.utils.interpolate(c, PAL.happy[i], k)), 0.5);
          if (!busy && !RM && t > 0) {
            gsap.timeline().to(bodyT, { y: -4, duration: 0.12, ease: 'power2.out' }).to(bodyT, { y: 0, duration: 0.3, ease: 'bounce.out' });
            mouth('mGrin'); gsap.delayedCall(0.7, () => { if (!busy) mouth('mSmile'); });
          }
        },
        lookAt: (target) => {
          if (RM) return;
          if (!target) return restLook();
          const b = target.getBoundingClientRect();
          lookLock = true;
          lookToward(b.left + b.width / 2, b.top + b.height / 2, 1.1);
        },
        notice: () => {
          if (RM || busy) return;
          if (sleeping) setMood('idle');
          eyeShape(1.12);
          gsap.timeline()
            .to(bodyT, { y: -10, scaleY: 1.05, duration: 0.22, ease: 'power2.out' })
            .to(bodyT, { y: 0, scaleY: 1, duration: 0.45, ease: 'bounce.out' })
            .to(bodyT, { y: -6, duration: 0.18, ease: 'power2.out' }, '+=0.15')
            .to(bodyT, { y: 0, duration: 0.4, ease: 'bounce.out' })
            .add(() => eyeShape(1));
        },
      };

      return () => {
        window.removeEventListener('pointermove', onMove);
        svg.removeEventListener('pointerenter', onEnter);
        svg.removeEventListener('pointerdown', onDown);
      };
    }, svg);

    return () => ctx.revert();
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ overflow: 'visible', display: 'block', filter: 'drop-shadow(0 6px 16px var(--cc-glow))', ['--cc-glow' as string]: PAL.idle[3] }}
    >
      <defs>
        <linearGradient id="cc-tile" x1="0" y1="0" x2="0.4" y2="1">
          <stop data-cc="s0" offset="0" stopColor={PAL.idle[0]} />
          <stop data-cc="s1" offset=".55" stopColor={PAL.idle[1]} />
          <stop data-cc="s2" offset="1" stopColor={PAL.idle[2]} />
        </linearGradient>
        <radialGradient id="cc-light" cx="50%" cy="0%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cc-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="cc-clip"><rect x="10" y="10" width="100" height="100" rx="34" /></clipPath>
      </defs>
      <circle data-cc="ring" cx="60" cy="60" r="50" fill="none" stroke={PAL.idle[1]} strokeWidth="2" opacity="0" />
      <g data-cc="body">
        <rect x="10" y="10" width="100" height="100" rx="34" fill="url(#cc-tile)" />
        <rect x="10" y="10" width="100" height="100" rx="34" fill="url(#cc-light)" />
        <g clipPath="url(#cc-clip)">
          <rect data-cc="shimmer" x="-40" y="0" width="40" height="120" fill="url(#cc-shine)" transform="skewX(-18)" opacity="0" />
        </g>
        <rect x="10.75" y="10.75" width="98.5" height="98.5" rx="33.25" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5" />
        <g data-cc="face">
          <ellipse data-cc="blush" cx="36" cy="74" rx="7" ry="4" fill="#ffd0c4" opacity="0" />
          <ellipse data-cc="blush" cx="84" cy="74" rx="7" ry="4" fill="#ffd0c4" opacity="0" />
          <g data-cc="eyesOpen" fill="#2d2b2c">
            <rect data-cc="eyeL" x="40" y="45" width="11" height="22" rx="5.5" />
            <rect x="69" y="45" width="11" height="22" rx="5.5" />
            <circle cx="48" cy="50" r="2" fill="#fff" opacity=".55" />
            <circle cx="77" cy="50" r="2" fill="#fff" opacity=".55" />
          </g>
          <g data-cc="eyesHappy" fill="none" stroke="#2d2b2c" strokeWidth="6" strokeLinecap="round" opacity="0">
            <path d="M39 61 Q45.5 49 52 61" /><path d="M68 61 Q74.5 49 81 61" />
          </g>
          <g data-cc="eyesShut" fill="none" stroke="#2d2b2c" strokeWidth="5" strokeLinecap="round" opacity="0">
            <path d="M39 60 Q45.5 64 52 60" /><path d="M68 60 Q74.5 64 81 60" />
          </g>
          <g data-cc="mouth" fill="none" stroke="#2d2b2c" strokeLinecap="round" strokeLinejoin="round">
            <path data-cc="mSmile" d="M53 77 Q60 82 67 77" strokeWidth="3.5" />
            <path data-cc="mGrin" d="M51 75 Q60 87 69 75 Z" fill="#2d2b2c" strokeWidth="3" opacity="0" />
            <ellipse data-cc="mO" cx="60" cy="79" rx="3.6" ry="4.2" fill="#2d2b2c" stroke="none" opacity="0" />
            <path data-cc="mFlat" d="M54 79 L66 79" strokeWidth="3.5" opacity="0" />
            <path data-cc="mWavy" d="M52 80 Q55 77 58 80 T64 80 T68 79" strokeWidth="3" opacity="0" />
            <path data-cc="mSide" d="M60 79 Q65 81 69 77" strokeWidth="3.5" opacity="0" />
          </g>
        </g>
      </g>
      <g data-cc="dots" fill={PAL.idle[1]}>
        <circle cx="98" cy="18" r="3.2" /><circle cx="107" cy="12" r="3.2" /><circle cx="116" cy="6" r="3.2" />
      </g>
      <text data-cc="zz" x="102" y="14" fontWeight="700" fontSize="15" fill="#a8a3a5" opacity="0">z</text>
    </svg>
  );
});

export default CrewChief;
