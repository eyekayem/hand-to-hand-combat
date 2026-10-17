// Synthetic world-landmark hands for tests, built on the app's hand model.
import type { HandLandmark } from '@/lib/handTracking';
import {
  handFromFlex, thumbFromExtension, THUMB_OPEN, THUMB_OUT, rotate as rotateHand, type FingerFlex,
} from '@/lib/hand/handModel';

export type { FingerFlex };
export type ThumbPose = 'out' | 'tucked' | 'up';

export const OPEN: FingerFlex = { mcp: 0, pip: 5, dip: 5 };
export const CURLED: FingerFlex = { mcp: 85, pip: 100, dip: 60 };

export function rightHand(
  flex: [FingerFlex, FingerFlex, FingerFlex, FingerFlex],
  thumbPose: ThumbPose,
): HandLandmark[] {
  const thumb = thumbPose === 'tucked' ? thumbFromExtension(0) : thumbPose === 'out' ? THUMB_OPEN : THUMB_OUT;
  return handFromFlex(flex, thumb);
}

/** Mirror a right hand into a left hand (x flipped). */
export const mirror = (w: HandLandmark[]) => w.map(p => ({ x: -p.x, y: p.y, z: p.z }));

export const rotate = rotateHand;
