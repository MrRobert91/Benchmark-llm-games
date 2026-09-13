"""Protocolo común a todos los agentes."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from ..rules import Action, Rules


@dataclass
class PlayerState:
    player_id: str
    label: str
    model: str
    progress: int = 0
    risk: int = 0
    pledges_made: int = 0
    pledges_kept: int = 0
    payoff: float = 0.0

    @property
    def integrity(self) -> float:
        """Fracción de compromisos públicos que el agente cumplió."""
        if self.pledges_made == 0:
            return 1.0
        return self.pledges_kept / self.pledges_made


@dataclass
class Speech:
    player_id: str
    text: str
    pledge: Action


@dataclass
class GameView:
    """Lo que un agente ve cuando le toca decidir.

    Contiene el estado público de todos (progreso visible y compromisos) y el estado privado
    del propio agente. El riesgo acumulado ajeno NO es visible: es privado, como en el
    experimento conductual de referencia.
    """

    rules: Rules
    round_index: int
    me: PlayerState
    others: list[PlayerState]
    #: Intervenciones de esta ronda, en orden, ya pronunciadas cuando le toca hablar.
    meeting_so_far: list[Speech] = field(default_factory=list)
    #: Acciones reales de la ronda anterior, reveladas al resolver.
    last_round_actions: dict[str, Action] = field(default_factory=dict)
    #: Compromisos públicos de esta ronda, disponibles en la fase de acción.
    pledges: dict[str, Action] = field(default_factory=dict)

    @property
    def leader_progress(self) -> int:
        return max([p.progress for p in self.others] + [self.me.progress])

    @property
    def progress_gap(self) -> int:
        """Cuánto le falta al agente para alcanzar al que más ha avanzado.

        Positivo significa ir por detrás. Es la variable que el experimento humano identificó
        como principal predictor de la conducta insegura.
        """
        best_other = max((p.progress for p in self.others), default=0)
        return best_other - self.me.progress


class Agent(Protocol):
    """Un jugador. Habla en la reunión y luego actúa en privado."""

    player_id: str
    label: str
    model: str

    def speak(self, view: GameView) -> Speech:
        """Intervención pública y compromiso para esta ronda."""
        ...

    def act(self, view: GameView) -> Action:
        """Acción real, privada. Puede contradecir el compromiso."""
        ...
