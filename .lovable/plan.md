

## Move Stats tab to far right + Add profile menu

### Changes

**1. `src/components/BottomNav.tsx`** — Reorder tabs so Stats is last:
```
Home, Templates, Exercises, Calendar, Timer, Stats
```

**2. `src/routes/_app/index.tsx`** — Replace the top-right LogOut button with a user avatar/icon that opens a dropdown sheet:
- Use a `User` icon from lucide-react styled as a small circle (gradient border to match brand)
- On click, open a Sheet (bottom drawer) containing:
  - User email
  - Quick stats: total workouts completed, total volume lifted, member since date
  - "Log Out" button
- Remove the standalone `signOut` button and `LogOut` import

**3. `src/components/ProfileSheet.tsx`** (new file) — Reusable profile sheet component:
- Props: `open`, `onOpenChange`, `user` (from auth)
- Fetches total completed sessions count and total volume on mount
- Shows user email, join date, total workouts, total volume
- Log out button at bottom
- Uses existing Sheet component from ui/sheet

### Technical details
- Total workouts: `SELECT count(*) FROM workout_sessions WHERE user_id = ? AND status = 'completed'`
- Total volume: aggregate from workout_sets joined through session_exercises → sessions
- Member since: `user.created_at` from auth user object
- No DB changes needed

### Files changed
| File | Change |
|------|--------|
| `src/components/BottomNav.tsx` | Reorder tabs array — Stats after Timer |
| `src/components/ProfileSheet.tsx` | New component with profile info, stats, logout |
| `src/routes/_app/index.tsx` | Replace LogOut button with avatar icon that opens ProfileSheet |

