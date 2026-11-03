import Mathlib

namespace OAI


noncomputable section

namespace Problem355

abbrev Point := ℝ × ℝ

def triangleArea (p q r : Point) : ℝ :=
  abs ((q.1 - p.1) * (r.2 - p.2) - (q.2 - p.2) * (r.1 - p.1)) / 2

def pointInUnitSquare (p : Point) : Prop :=
  0 ≤ p.1 ∧ p.1 ≤ 1 ∧ 0 ≤ p.2 ∧ p.2 ≤ 1

def pointsInUnitSquare (P : Finset Point) : Prop := by
  classical
  exact ∀ p, p ∈ P → pointInUnitSquare p

def triangleAreasAtLeast (P : Finset Point) (a : ℝ) : Prop := by
  classical
  exact ∀ p, p ∈ P → ∀ q, q ∈ P → ∀ r, r ∈ P →
    p ≠ q → p ≠ r → q ≠ r → a ≤ triangleArea p q r

def hasTriangleAreaAtMost (P : Finset Point) (a : ℝ) : Prop := by
  classical
  exact ∃ p, p ∈ P ∧ ∃ q, q ∈ P ∧ ∃ r, r ∈ P ∧
    p ≠ q ∧ p ≠ r ∧ q ≠ r ∧ triangleArea p q r ≤ a

def heilbronnD : ℕ := 41

def heilbronnM : ℕ := Nat.choose (4 * heilbronnD - 1) heilbronnD

def heilbronnT : ℕ := Nat.choose heilbronnM 3

@[irreducible] def heilbronnK : ℕ := heilbronnT ^ 2 + 1

def heilbronnExponent : ℝ :=
  1 / (100000 * (heilbronnK : ℝ))

def eventualAlmostUpperBound (epsilon : ℝ) : Prop :=
  ∃ C : ℝ, 0 < C ∧ ∃ n0 : ℕ, ∀ n : ℕ, n0 ≤ n → 3 ≤ n →
    ∀ P : Finset Point, P.card = n → pointsInUnitSquare P →
      hasTriangleAreaAtMost P
        (C * Real.rpow (n : ℝ) (-2 + epsilon))

end Problem355

end

end OAI

/-!
Released under Apache 2.0 as described in LICENSE.
Prepared with assistance from Claude (Anthropic).

Parameterized target for the Big O Speedrun Heilbronn triangle board,
https://bigospeedrun.com/other/heilbronn-triangle.

The imported OpenAI definitions are frozen byte for byte; see README.md and
NOTICE. This file adds one definition and assumes no estimate or proof of any
bound.
-/

namespace BigOSpeedrun.HeilbronnTriangle

open OAI.Problem355

/-- The board's claim `Δ(n) ≥ c · n^(-2+η)` for every sufficiently large `n`.

`Δ(n)` is the largest possible smallest triangle area among `n` distinct points
of the closed unit square. For `n ≥ 3`, `Δ(n) ≥ a` holds exactly when some
`n`-point set has every triangle area at least `a`, because the supremum is
attained. So the target asks for one positive constant `c`, one threshold `N`,
and, for every `n ≥ N`, an `n`-point set whose triangles all have area at least
`c · n^(-2+η)`.

The controller substitutes an exact nonnegative rational for `η`. Larger values
are better. -/
def Bound (η : ℚ) : Prop :=
  ∃ c : ℝ, 0 < c ∧ ∃ N : ℕ, ∀ n : ℕ, N ≤ n →
    ∃ P : Finset Point, P.card = n ∧ pointsInUnitSquare P ∧
      triangleAreasAtLeast P (c * Real.rpow (n : ℝ) (-2 + (η : ℝ)))

end BigOSpeedrun.HeilbronnTriangle
