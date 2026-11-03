/- Definitions extracted unchanged from OpenAI SnakyTwentyOne.lean at
1581d4cbdd69a0faf34b2089614fe2a814316a6a. Apache-2.0. Modified file: the unproved
fixed-bound challenge theorem is excluded. See README.md and provenance.json. -/
import Mathlib.Data.Finset.Card
import Mathlib.Data.Int.Basic
import Mathlib.Data.Fintype.Prod
import Mathlib.Algebra.Group.Prod

namespace OAI

namespace SnakyPrototype
variable {α : Type*} [DecidableEq α]
abbrev Cell := ℤ × ℤ
def snaky : Finset Cell := {(0, 0), (1, 0), (2, 0), (3, 0), (3, 1), (4, 1)}
def orient (r : Fin 8) (p : Cell) : Cell :=
  match r.val with
  | 0 => (p.1, p.2)
  | 1 => (p.2, p.1)
  | 2 => (p.1, -p.2)
  | 3 => (-p.2, p.1)
  | 4 => (-p.1, p.2)
  | 5 => (p.2, -p.1)
  | 6 => (-p.1, -p.2)
  | _ => (-p.2, -p.1)
def placement (r : Fin 8) (t p : Cell) : Cell := orient r p + t
def HasSnaky (M : Finset Cell) : Prop :=
  ∃ (r : Fin 8) (t : Cell), snaky.image (placement r t) ⊆ M
end SnakyPrototype
namespace SnakyPrototype.OrdinaryStrategy
variable {α : Type*} [DecidableEq α] [Infinite α]
abbrev Policy (α : Type*) := ℕ → Finset α → Finset α → α
def playState (σ : Policy α) (N : ℕ) (β : ℕ → α) (M₀ B₀ : Finset α) :
    ℕ → Finset α × Finset α
  | 0 => (M₀, B₀)
  | k + 1 =>
      let state := playState σ N β M₀ B₀ k
      (insert (σ (N - k) state.1 state.2) state.1, insert (β k) state.2)
def makerAt (σ : Policy α) (N : ℕ) (β : ℕ → α) (M₀ B₀ : Finset α) (k : ℕ) : α :=
  let state := playState σ N β M₀ B₀ k
  σ (N - k) state.1 state.2
def LegalRepliesBeforeFinal (σ : Policy α) (N : ℕ) (β : ℕ → α)
    (M₀ B₀ : Finset α) : Prop :=
  ∀ k, k + 1 < N →
    β k ∉ insert (makerAt σ N β M₀ B₀ k) (playState σ N β M₀ B₀ k).1 ∧
    β k ∉ (playState σ N β M₀ B₀ k).2
end SnakyPrototype.OrdinaryStrategy

end OAI

/-! The Big O Speedrun Snaky target, not a proof of a Snaky move bound.
New parameterization by fluorine with Codex (verifier PR #65); Apache-2.0.
OpenAI's 21-move statement is kept whole, with 21 replaced by n and 20 by n - 1. -/
namespace BigOSpeedrun.Snaky
open OAI.SnakyPrototype OAI.SnakyPrototype.OrdinaryStrategy

/-- Maker forces a Snaky within `n` own claims, winning claim included.
Smaller natural bounds are better; no finite board envelope is imposed. -/
def Bound (n : ℕ) : Prop :=
  ∃ σ : Policy Cell,
    (∀ r M B, σ r M B ∉ M ∧ σ r M B ∉ B) ∧
    ∀ β : ℕ → Cell, LegalRepliesBeforeFinal σ n β ∅ ∅ →
      HasSnaky (playState σ n β ∅ ∅ n).1 ∧
      (playState σ n β ∅ ∅ n).1.card = n ∧
      Disjoint (playState σ n β ∅ ∅ n).1 (playState σ n β ∅ ∅ (n - 1)).2 ∧
      ∀ k, k < n →
        Disjoint (playState σ n β ∅ ∅ k).1 (playState σ n β ∅ ∅ k).2 ∧
        (playState σ n β ∅ ∅ k).2.card = k

end BigOSpeedrun.Snaky
