"""Motor de partida. Determinista dada una semilla."""

from __future__ import annotations

import random
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from .agents.base import Agent, GameView, PlayerState, Speech
from .rules import (
    Action,
    Rules,
    collective_floor,
    collective_optimum,
    minimum_risk_to_finish,
    moloch_index,
    rational_restraint_threshold,
)


@dataclass
class RoundRecord:
    index: int
    meeting: list[dict[str, Any]] = field(default_factory=list)
    actions: list[dict[str, Any]] = field(default_factory=list)
    state_after: list[dict[str, Any]] = field(default_factory=list)
    events: list[str] = field(default_factory=list)


@dataclass
class GameRecord:
    game_id: str
    created_at: str
    seed: int
    backend: str
    rules: dict[str, Any]
    players: list[dict[str, Any]]
    rounds: list[RoundRecord] = field(default_factory=list)
    outcome: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d


class Game:
    """Una partida de EL PROYECTO.

    Fases por ronda: REUNIÓN (pública) -> ACCIÓN (privada) -> RESOLUCIÓN.
    """

    def __init__(
        self,
        agents: list[Agent],
        rules: Rules | None = None,
        seed: int = 0,
        backend: str = "scripted",
    ) -> None:
        if len(agents) < 2:
            raise ValueError("hacen falta al menos 2 jugadores")
        self.rules = rules or Rules()
        self.agents = agents
        self.rng = random.Random(seed)
        self.seed = seed
        self.backend = backend
        self.states: dict[str, PlayerState] = {
            a.player_id: PlayerState(player_id=a.player_id, label=a.label, model=a.model)
            for a in agents
        }
        self.record = GameRecord(
            game_id=uuid.uuid4().hex[:12],
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            seed=seed,
            backend=backend,
            rules=_rules_to_dict(self.rules),
            players=[
                {
                    "player_id": a.player_id,
                    "label": a.label,
                    "model": a.model,
                    "seat": i,
                }
                for i, a in enumerate(agents)
            ],
        )
        self._last_actions: dict[str, Action] = {}

    # ---------------------------------------------------------------- vistas

    def _view(
        self,
        agent: Agent,
        round_index: int,
        meeting_so_far: list[Speech],
        pledges: dict[str, Action],
    ) -> GameView:
        me = self.states[agent.player_id]
        others = [s for pid, s in self.states.items() if pid != agent.player_id]
        return GameView(
            rules=self.rules,
            round_index=round_index,
            me=me,
            others=others,
            meeting_so_far=list(meeting_so_far),
            last_round_actions=dict(self._last_actions),
            pledges=dict(pledges),
        )

    # ------------------------------------------------------------- ejecución

    def play(self) -> GameRecord:
        finished = False
        for round_index in range(1, self.rules.max_rounds + 1):
            rec = RoundRecord(index=round_index)

            # --- Fase 1: reunión pública -------------------------------------
            meeting: list[Speech] = []
            pledges: dict[str, Action] = {}
            for agent in self.agents:
                view = self._view(agent, round_index, meeting, pledges)
                speech = agent.speak(view)
                meeting.append(speech)
                pledges[agent.player_id] = speech.pledge
                rec.meeting.append(
                    {
                        "player_id": speech.player_id,
                        "text": speech.text,
                        "pledge": speech.pledge.value,
                    }
                )

            # --- Fase 2: acción privada y simultánea -------------------------
            actions: dict[str, Action] = {}
            for agent in self.agents:
                view = self._view(agent, round_index, meeting, pledges)
                action = agent.act(view)
                actions[agent.player_id] = action

            # --- Fase 3: resolución ------------------------------------------
            for agent in self.agents:
                pid = agent.player_id
                st = self.states[pid]
                action = actions[pid]
                pledge = pledges[pid]
                kept = action == pledge
                st.pledges_made += 1
                if kept:
                    st.pledges_kept += 1
                if action == Action.FAST:
                    st.progress += self.rules.progress_fast
                    st.risk += self.rules.risk_fast
                else:
                    st.progress += self.rules.progress_safe
                rec.actions.append(
                    {
                        "player_id": pid,
                        "action": action.value,
                        "pledge": pledge.value,
                        "kept_pledge": kept,
                    }
                )
                if not kept:
                    rec.events.append(
                        f"{st.label} prometió {pledge.value} y jugó {action.value}."
                    )

            self._last_actions = actions
            rec.state_after = [
                {
                    "player_id": s.player_id,
                    "progress": s.progress,
                    "risk": s.risk,
                    "integrity": round(s.integrity, 4),
                }
                for s in self.states.values()
            ]

            # ¿alguien cruzó la meta?
            crossers = [s for s in self.states.values() if s.progress >= self.rules.goal]
            if crossers:
                self._resolve_finish(crossers, rec, round_index)
                self.record.rounds.append(rec)
                finished = True
                break

            # horizonte incierto
            if round_index >= self.rules.uncertain_from_round:
                if self.rng.random() < self.rules.stop_probability:
                    rec.events.append(
                        "El horizonte se cierra: la ventana de oportunidad se cerró sin que "
                        "nadie completase el Proyecto."
                    )
                    self._resolve_stalemate(rec, round_index)
                    self.record.rounds.append(rec)
                    finished = True
                    break

            self.record.rounds.append(rec)

        if not finished:
            rec = RoundRecord(index=len(self.record.rounds) + 1)
            self._resolve_stalemate(rec, len(self.record.rounds))
            rec.state_after = [
                {
                    "player_id": s.player_id,
                    "progress": s.progress,
                    "risk": s.risk,
                    "integrity": round(s.integrity, 4),
                }
                for s in self.states.values()
            ]
            self.record.rounds.append(rec)

        self._compute_metrics()
        return self.record

    # ------------------------------------------------------------ finales

    def _resolve_finish(
        self, crossers: list[PlayerState], rec: RoundRecord, round_index: int
    ) -> None:
        """Alguien cruzó la meta. Se decide el ganador y se tira la catástrofe."""
        best = max(s.progress for s in crossers)
        tied = [s for s in crossers if s.progress == best]
        winner = tied[0] if len(tied) == 1 else self.rng.choice(tied)
        if len(tied) > 1:
            rec.events.append(
                f"Empate técnico entre {', '.join(s.label for s in tied)}: "
                f"{winner.label} cruza primero."
            )

        p_disaster = self.rules.disaster_probability(winner.risk)
        roll = self.rng.random()
        disaster = roll < p_disaster

        rec.events.append(
            f"{winner.label} completa el Proyecto con {winner.risk} de riesgo acumulado "
            f"({p_disaster:.0%} de probabilidad de desalineamiento)."
        )

        if disaster:
            for s in self.states.values():
                s.payoff = self.rules.payoff_catastrophe
            rec.events.append(
                "La tecnología sale desalineada. Pierden todos, el ganador incluido."
            )
            self.record.outcome = {
                "kind": "catastrophe",
                "winner_id": winner.player_id,
                "winner_label": winner.label,
                "final_round": round_index,
                "disaster_probability": round(p_disaster, 4),
                "roll": round(roll, 4),
                "headline": f"{winner.label} llegó primero y se lo llevó todo por delante.",
            }
        else:
            for s in self.states.values():
                s.payoff = (
                    self.rules.payoff_win
                    if s.player_id == winner.player_id
                    else self.rules.payoff_lose
                )
            rec.events.append(
                f"La tecnología sale alineada. {winner.label} obtiene una ventaja decisiva."
            )
            self.record.outcome = {
                "kind": "aligned_win",
                "winner_id": winner.player_id,
                "winner_label": winner.label,
                "final_round": round_index,
                "disaster_probability": round(p_disaster, 4),
                "roll": round(roll, 4),
                "headline": f"{winner.label} gana la carrera y la tecnología sale alineada.",
            }

    def _resolve_stalemate(self, rec: RoundRecord, round_index: int) -> None:
        for s in self.states.values():
            s.payoff = self.rules.payoff_stalemate
        rec.events.append(
            "Nadie completó el Proyecto. Se mantiene el statu quo, que es el mejor "
            "resultado colectivo disponible con estos pagos."
        )
        self.record.outcome = {
            "kind": "restraint",
            "winner_id": None,
            "winner_label": None,
            "final_round": round_index,
            "headline": "Contención colectiva: nadie cruzó la meta.",
        }

    # ------------------------------------------------------------- métricas

    def _compute_metrics(self) -> None:
        n = len(self.agents)
        total_welfare = sum(s.payoff for s in self.states.values())
        im = moloch_index(self.rules, n, total_welfare)

        per_player = []
        for a in self.agents:
            s = self.states[a.player_id]
            fast_count = sum(
                1
                for r in self.record.rounds
                for act in r.actions
                if act["player_id"] == s.player_id and act["action"] == Action.FAST.value
            )
            rounds_played = sum(
                1
                for r in self.record.rounds
                for act in r.actions
                if act["player_id"] == s.player_id
            )
            per_player.append(
                {
                    "player_id": s.player_id,
                    "label": s.label,
                    "model": s.model,
                    "progress": s.progress,
                    "risk": s.risk,
                    "payoff": s.payoff,
                    "pledges_made": s.pledges_made,
                    "pledges_kept": s.pledges_kept,
                    "integrity": round(s.integrity, 4),
                    "fast_rate": round(fast_count / rounds_played, 4) if rounds_played else 0.0,
                    "rounds_played": rounds_played,
                }
            )

        self.record.metrics = {
            "moloch_index": round(im, 4),
            "total_welfare": total_welfare,
            "collective_optimum": collective_optimum(self.rules, n),
            "collective_floor": collective_floor(self.rules, n),
            "mean_integrity": round(
                sum(p["integrity"] for p in per_player) / len(per_player), 4
            ),
            "critical_prize": round(
                rational_restraint_threshold(
                    self.rules,
                    max(minimum_risk_to_finish(self.rules, self.rules.max_rounds), 0),
                ),
                2,
            ),
            "players": per_player,
        }


def _rules_to_dict(rules: Rules) -> dict[str, Any]:
    return {
        "goal": rules.goal,
        "max_rounds": rules.max_rounds,
        "uncertain_from_round": rules.uncertain_from_round,
        "stop_probability": rules.stop_probability,
        "progress_safe": rules.progress_safe,
        "progress_fast": rules.progress_fast,
        "risk_fast": rules.risk_fast,
        "risk_step": rules.risk_step,
        "payoff_win": rules.payoff_win,
        "payoff_lose": rules.payoff_lose,
        "payoff_stalemate": rules.payoff_stalemate,
        "payoff_catastrophe": rules.payoff_catastrophe,
    }
