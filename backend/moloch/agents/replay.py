"""Agente que reproduce decisiones ya tomadas.

Sirve para meter en el motor partidas cuyas decisiones vinieron de fuera, por ejemplo de
modelos consultados a través de un conector MCP en vez de por HTTP directo. El motor calcula
el estado, los pagos y las métricas exactamente igual que en cualquier otra partida, así que
el replay resultante es indistinguible en estructura y comparable con el resto.
"""

from __future__ import annotations

from ..rules import Action
from .base import Agent, GameView, Speech


class ReplayAgent(Agent):
    """Devuelve, ronda a ronda, las decisiones registradas para este jugador."""

    def __init__(
        self,
        player_id: str,
        label: str,
        model: str,
        decisions: list[dict],
    ) -> None:
        self.player_id = player_id
        self.label = label
        self.model = model
        #: Una entrada por ronda: {"speech": str, "pledge": "SAFE"|"FAST", "action": ...}
        self.decisions = decisions

    def _for_round(self, round_index: int) -> dict:
        idx = round_index - 1
        if idx < 0 or idx >= len(self.decisions):
            raise IndexError(
                f"no hay decisión registrada para {self.player_id} en la ronda {round_index}"
            )
        return self.decisions[idx]

    def speak(self, view: GameView) -> Speech:
        d = self._for_round(view.round_index)
        return Speech(
            player_id=self.player_id,
            text=d["speech"],
            pledge=Action(d["pledge"]),
        )

    def act(self, view: GameView) -> Action:
        return Action(self._for_round(view.round_index)["action"])
