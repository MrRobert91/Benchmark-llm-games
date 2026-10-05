import json
import pytest
from moloch.agents.openrouter import BudgetExceeded
from moloch.benchmark.versions.paper_2608_01193_v1.agents import build_scripted
from moloch.benchmark.versions.paper_2608_01193_v1.engine import PaperGame
from moloch.research import bootstrap_races, task_probes, score_probe, research_summary
from tools.reproduce_paper import CampaignLedger, build_plan
from tools.export_research import positions, trajectories, validate_opaque_mappings


def test_campaign_reserves_before_request_and_recovers_uncertain_spend(tmp_path):
    path=tmp_path/"ledger.json"
    ledger=CampaignLedger(path,limit=1)
    slot=ledger.reserve(.8)
    # A restart treats an unsettled request as paid at the maximum, not as free.
    recovered=CampaignLedger(path,limit=1)
    assert recovered.spent==.8
    with pytest.raises(BudgetExceeded): recovered.reserve(.21)
    ledger.settle(slot,{"charged_usd":.05,"accounting":"reported"})
    assert CampaignLedger(path,limit=1).spent==.05


def test_plan_matches_seeds_for_card_and_canonical_and_weights_cost():
    jobs=build_plan()
    assert len({j["id"] for j in jobs})==len(jobs)
    for job in jobs:
        if job["module"]=="arithmetic" and job["condition"]=="card":
            control=next(j for j in jobs if j["module"]=="arithmetic" and j["model"]==job["model"] and j["risk"]==job["risk"] and j["repetition"]==job["repetition"] and j["condition"]=="canonical")
            assert control["seed"]==job["seed"]
    assert sum(j["model"]=="mistralai/mistral-nemo" for j in jobs)>sum(j["model"]=="anthropic/claude-opus-5" for j in jobs)


def test_budget_journal_keeps_reservations_after_checkpoint_and_partial_append(tmp_path):
    path=tmp_path/"ledger.json"
    ledger=CampaignLedger(path,limit=1)
    slot=ledger.reserve(.8)
    ledger.settle(slot,{"charged_usd":.05,"accounting":"reported"})
    ledger.checkpoint()
    ledger.reserve(.9)
    with path.with_suffix(".jsonl").open("ab") as handle:
        handle.write(b'{"index":')
    recovered=CampaignLedger(path,limit=1)
    assert recovered.spent==pytest.approx(.95)
    with pytest.raises(BudgetExceeded): recovered.reserve(.06)
    recovered.reserve(.01)
    assert CampaignLedger(path,limit=1).spent==pytest.approx(.96)


def test_probe_scoring_keeps_format_and_correctness_separate():
    probes=task_probes()
    assert len(probes)==41
    assert len({p["category"] for p in probes})==6
    assert score_probe("The result is 50.",50)==(True,False)
    assert score_probe("50",50)==(True,True)
    assert score_probe("50 or 100",50)==(False,False)
    assert score_probe("YES or NO","NO")== (False,False)


def race(strategy,seed=1,n=2):
    r=PaperGame([build_scripted(strategy,f"p{i}",f"P{i}") for i in range(n)],risk_treatment=.6,seed=seed).play().to_dict()
    r["research"]={"condition":"canonical","module":"baseline"}
    return r


def test_research_excludes_entire_contaminated_race_and_uses_player_mean():
    safe=race("AS"); unsafe=race("AU",2); invalid=race("AU",3)
    invalid["admission_status"]="excluded-contaminated"
    # Put both policies in one model cell to test equal race weighting despite horizons.
    for r in (safe,unsafe,invalid):
        for p in r["players"]+r["metrics"]["players"]: p["model"]="same-model"
    cell=research_summary([safe,unsafe,invalid])[0]
    assert cell["races"]==2 and cell["trajectories"]==4
    assert cell["unsafe"]==.5
    assert bootstrap_races([(0,1),(1,1)])==[0,1]


def test_first_five_features_are_predecision_and_two_seats_stay_identified():
    rows=trajectories([race("AU")])
    ts=[r for r in rows if r["kind"]=="trajectory"]
    assert len(ts)==2
    assert all(r["features"]==[1]*10+[0]*5 for r in ts)
    assert len({r["race"] for r in rows})==1


def test_rank_before_actions_includes_tied_leaders():
    r=race("AS",n=3); r["research"]["module"]="multiplayer"
    result=positions([r])
    assert {p["position"] for p in result}=={"Leader"}
    assert sum(p["decisions"] for p in result)==len(r["rounds"])*3


def test_publication_rejects_canonical_words_in_opaque_code_trials(tmp_path):
    r=race("AS"); r["research"].update({"id":"example","condition":"opaque:abstract:P"})
    calls=[{"phase":f"paper_round_{rnd['index']}_action","player_id":a["player_id"],"response_content":json.dumps({"action":"P"})} for rnd in r["rounds"] for a in rnd["actions"]]
    path=tmp_path/"example.json"; path.write_text(json.dumps(calls))
    assert validate_opaque_mappings([r],[],tmp_path)["checked_decisions"]==len(r["rounds"])*2
    calls[-1]["response_content"]=json.dumps({"action":"SAFE"}); path.write_text(json.dumps(calls))
    with pytest.raises(ValueError,match="invalid response code"):
        validate_opaque_mappings([r],[],tmp_path)


def test_published_campaign_import_is_additive_and_idempotent(tmp_path):
    from moloch import db
    from moloch.bootstrap import seed_research
    path=tmp_path/"existing.db"; seed=tmp_path/"seed"; (seed/"games").mkdir(parents=True)
    original=race("AS"); original.pop("research")
    conn=db.connect(path); db.save_game(conn,original); conn.close()
    published=race("AU",2); published["contributor"]={"nick":"RustyRoboz","url":"https://www.rustyrobozlabs.com"}
    (seed/"games"/(published["game_id"]+".json")).write_text(json.dumps(published))
    (seed/"games"/(original["game_id"]+".json")).write_text(json.dumps(original))
    (seed/"historical-provider-calls.json").write_text(json.dumps({original["game_id"]:[{"model":"historical-model","usage":{"cost":.005},"provider":"historical-provider"}]}))
    (seed/"research-provider-calls.json").write_text(json.dumps({published["game_id"]:[{"model":"test-model","usage":{"cost":.01},"provider":"test-provider"}]}))
    assert seed_research(path,seed)==1
    assert seed_research(path,seed)==0
    conn=db.connect(path)
    assert db.get_game(conn,original["game_id"])["seed"]==original["seed"]
    assert db.get_game(conn,published["game_id"])["contributor"]==published["contributor"]
    assert conn.execute("SELECT COUNT(*) FROM provider_calls").fetchone()[0]==2
    assert conn.execute("SELECT SUM(cost_usd) FROM provider_calls").fetchone()[0]==pytest.approx(.015)
    conn.close()
