# Matt Pocock: De-Slop A Codebase Ruined By AI

Source: [How To De-Slop A Codebase Ruined By AI (with one skill)](https://www.youtube.com/watch?v=3MP8D-mdheA) by Matt Pocock, published April 29, 2026.

This is a detailed, timestamped notes file, not a verbatim transcript. The video captions and Matt's `improve-codebase-architecture` skill were used as source material, but the notes are paraphrased to keep the file useful and readable.

Related skill source: [`improve-codebase-architecture`](https://skills.sh/mattpocock/skills/improve-codebase-architecture).

## Core Thesis

AI accelerates software entropy. It can create code faster than a human, but it can also spread shallow modules, duplicated logic, accidental seams, and brittle tests faster than a human would. The cure is not more code. The cure is better Module design: deeper Modules, smaller Interfaces, real Seams, disciplined Adapters, higher Locality, and higher Leverage.

The skill Matt demonstrates is designed to inspect a codebase for architectural friction and find "deepening opportunities": refactors that move scattered behavior behind a smaller, stronger Interface.

## Matt's Architecture Vocabulary

- **Module**: Anything with an Interface and an Implementation. A function, class, package, workflow slice, or tier-spanning capability can all be Modules.
- **Interface**: Everything a caller must know to use the Module correctly, including types, invariants, order of calls, error modes, required configuration, and performance expectations.
- **Implementation**: The code inside the Module.
- **Depth**: The amount of behavior hidden behind a small Interface. A deep Module gives callers a lot of behavior for little Interface learning.
- **Shallow Module**: A Module whose Interface is almost as complicated as the Implementation it wraps.
- **Seam**: The place where an Interface lives and where behavior can be changed without editing in place.
- **Adapter**: A concrete thing satisfying an Interface at a Seam.
- **Leverage**: What callers get from Depth: more useful behavior per unit of Interface they learn.
- **Locality**: What maintainers get from Depth: related change, bugs, knowledge, and verification concentrate in one place.

## Operating Principles

- Use the deletion test: if deleting a Module makes complexity vanish, it was likely a pass-through; if deleting it spreads complexity across callers, it was earning its keep.
- The Interface is the test surface. If tests must reach around the Interface, the Module shape may be wrong.
- One Adapter means a hypothetical Seam. Two Adapters mean a real Seam.
- Internal Seams can exist inside a deep Module for its own testing, but they should not leak into the external Interface unless callers truly need them.
- Test behavior through the deepened Module's Interface. Old unit tests around shallow helpers become waste once stronger tests exist at the real Seam.

## Timestamped Notes

### 00:00 - AI And Code Entropy

Matt starts from the problem: AI makes codebase entropy faster. A model can make a small change that looks locally reasonable but worsens the codebase's long-term shape. The dangerous part is not that AI writes code; it is that AI writes into existing structure. If the structure is messy, AI tends to amplify that mess.

The response should not be panic or abstinence. The response should be better architecture vocabulary and a repeatable way to ask an agent to improve the shape of the codebase.

### 00:36 - The Cure And The Shared Words

Matt introduces the cure as architectural cleanup guided by shared language. The important move is to stop talking vaguely about "clean code" and start naming the structural forces: Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, and Locality.

This vocabulary matters because AI agents follow concrete language better than vibes. If we say exactly what we mean, the agent can inspect code for shallow Modules, leaky Seams, and low Locality.

### 01:45 - Modules And Interfaces

Matt leans on the deep Module idea from software design fundamentals. A good Module is not necessarily small inside. It is deep at its Interface: callers learn a small surface and get a lot of behavior.

The mistake AI often makes is creating many small, shallow Modules. Each looks tidy in isolation, but understanding the behavior requires bouncing between files. The result is low Leverage for callers and low Locality for maintainers.

### 03:45 - Seams And Adapters

Seams are where behavior can vary without editing the caller. Adapters are concrete implementations at those Seams. Matt connects this to ports-and-adapters style thinking, but with discipline: do not create a Seam just because it feels architectural. A Seam becomes real when more than one Adapter needs to exist, commonly production and test Adapters.

This is also a testing point. Tests should cross the same Interface callers cross. If a test needs intimate knowledge of a helper, ordering trick, or scattered setup, that is evidence that the current Module may be shallow or placed at the wrong Seam.

### 04:44 - Why Deep Modules Help AI

Deep Modules make AI coding safer because the agent has less surface area to reason about. A strong Interface tells the agent where behavior belongs, where tests should attach, and where changes should concentrate.

The payoff is Locality and Leverage. A fix in one deep Module improves all callers. A test at one real Seam verifies behavior that would otherwise be scattered across many shallow helpers.

### 05:27 - Demo: Looking For Deepening Opportunities

Matt demonstrates the skill on a real project. The skill does not immediately propose code. It first explores. It looks for places where understanding one concept requires too many Modules, where tests exist only because helpers were extracted, where coupling leaks across Seams, and where related behavior has split into parallel Implementations.

The output should be candidate deepening opportunities, not an instant refactor. Each candidate should name files, the architectural problem, the plain-English solution, and the benefits in terms of Locality, Leverage, and better tests.

### 06:31 - AI-Guided Refactoring

The next move is to pick a candidate and design the new Module shape. Matt's skill explicitly avoids proposing Interfaces too early. First identify the friction. Then grill the design: what sits behind the Seam, what dependencies are in-process, local-substitutable, remote-but-owned, or truly external, and what tests should survive.

For interface design, the skill uses "design it twice": generate radically different Interface options, compare Depth, Locality, Seam placement, and Adapter strategy, then recommend the strongest design.

### 09:34 - Human In The Loop

Matt is clear that the human is still the strategist. The agent can be a tactical programmer and can run a lot of exploration, but someone needs to make the long-term calls about what the codebase should become.

This matters especially for cleanup. An AI can propose plausible refactors forever. The human should decide which architectural friction is real, which Seams are worth making real, and which cleanup creates the most Leverage.

### 10:25 - Legacy Code, Harnesses, And Tests

For legacy or messy codebases, Matt emphasizes having a harness and useful tests. If there is no way to verify behavior, deepening becomes riskier. The goal is not to preserve every existing test; it is to replace shallow tests with behavior tests at the Module Interface.

Matt suggests using the skill repeatedly, especially after bursts of AI-generated work. The codebase should be revisited every few days or weekly so architectural entropy does not silently accumulate.

## Practical Checklist For This Repo

- Read `CONTEXT.md` and ADRs if present; create lightweight context only when a term becomes necessary.
- Explore organically before editing.
- Prefer deepening Modules over adding more wrappers.
- Use the deletion test before keeping a helper or new abstraction.
- Keep Seams real: production plus test Adapter, or do not expose the Seam.
- Move tests toward the Interface of the deepened Module.
- Delete old shallow tests or helpers when the deeper Module makes them redundant.
- Keep commits small enough that each one has one architectural story.
