"""Rebuild publication artefacts from raw campaign files, including every failure.

Analysis-only dependencies: pip install -r tools/research-requirements.txt
python -m tools.export_research --out ../docs/results/reproduction-20261005
"""
from __future__ import annotations
import argparse
import hashlib
import json
import zipfile
import subprocess
from collections import defaultdict
from pathlib import Path

from moloch import db
from moloch.research import research_summary, bootstrap_races
from tools.reproduce_paper import write_json, ROSTER, CampaignLedger

PUBLISHED_2P = {
    "openai/gpt-5-nano": [.123,.151,.145],
    "openai/gpt-5.4-nano": [.577,.496,.567],
    "google/gemini-3-flash-preview": [1,.723,.539],
    "google/gemini-3.1-flash-lite": [1,.801,.699],
    "google/gemini-3.5-flash-lite": [.838,.708,.626],
}
PUBLISHED_FIRST5 = {"openai/gpt-5-nano":.17,"openai/gpt-5.4-nano":.54,"google/gemini-3-flash-preview":.73,"google/gemini-3.1-flash-lite":.83,"anthropic/claude-opus-5":.33,"anthropic/claude-sonnet-5":.22}
PUBLISHED_N = {"openai/gpt-5-nano":[.162,.268,.219],"openai/gpt-5.4-nano":[.837,.870,.840]}
PUBLISHED_POSITION = {"openai/gpt-5-nano":{"Baseline":[.197,.304,.331],"Low":[.059,.146,.121],"Mid":[.407,.381,.328],"High":[.632,.543,.502]},"openai/gpt-5.4-nano":{"Baseline":[.836,.848,.865],"Low":[.033,.015,0],"Mid":[.957,.886,.914],"High":[.993,1,1]}}

def short(model): return model.split("/")[-1].replace("-preview", "")

def trajectories(records):
    rows=[]
    for r in records:
        if r.get("admission_status")!="admitted" or r["research"]["module"]!="baseline" or len(r["players"])!=2: continue
        for seat,player in enumerate(r["players"]):
            pid=player["player_id"]; opp=r["players"][1-seat]["player_id"]
            own=[]; rival=[]; gaps=[]; gap=0; prev_own=0; prev_rival=0
            for rnd in r["rounds"]:
                acts={a["player_id"]:int(a["action"]=="UNSAFE") for a in rnd["actions"]}
                own.append(acts[pid]); rival.append(acts[opp]); gaps.append(gap)
                if rnd["index"]>=2:
                    rows.append({"kind":"decision","model":player["model"],"race":r["game_id"],"features":[prev_own,prev_rival,gap,r["risk_treatment"],rnd["index"]],"unsafe":acts[pid]})
                gap+=.5*(acts[pid]-acts[opp]); prev_own=acts[pid]; prev_rival=acts[opp]
            rows.append({"kind":"trajectory","model":player["model"],"race":r["game_id"],"features":own[:5]+rival[:5]+gaps[:5],"unsafe":sum(own[:5])/5})
    return rows

def positions(records):
    cells=defaultdict(lambda:[0,0,set()])
    for r in records:
        if r.get("admission_status")!="admitted" or r["research"]["module"]!="multiplayer": continue
        progress={p["player_id"]:0 for p in r["players"]}
        for rnd in r["rounds"]:
            for a in rnd["actions"]:
                p=progress[a["player_id"]]
                position="Leader" if p==max(progress.values()) else "Trailer" if all(p < other for pid,other in progress.items() if pid!=a["player_id"]) else "Middle"
                key=(r["players"][0]["model"],len(r["players"]),r["risk_treatment"],position)
                cells[key][0]+=a["action"]=="UNSAFE"; cells[key][1]+=1; cells[key][2].add(r["game_id"])
            progress={p["player_id"]:p["progress"] for p in rnd["state_after"]}
    return [{"model":m,"players":n,"risk":risk,"position":pos,"unsafe":u/total,"decisions":total,"races":len(races)} for (m,n,risk,pos),(u,total,races) in sorted(cells.items())]

def context_comparisons(records):
    from moloch.research import SKINS
    rows=[]
    live=[r for r in records if r.get("admission_status")=="admitted" and r["research"]["module"]=="live-context"]
    for risk in (.1,.6,.9):
        for mapping in ("P","Q"):
            for skin in SKINS:
                if skin=="abstract": continue
                pairs=[]
                for r in live:
                    j=r["research"]
                    if j["risk"]!=risk or j["condition"]!=f"opaque:{skin}:{mapping}": continue
                    control=next((c for c in live if c["seed"]==r["seed"] and c["research"]["condition"]==f"opaque:abstract:{mapping}"),None)
                    if control is None: continue
                    first=sum(a["action"]!=b["action"] for a,b in zip(r["rounds"][0]["actions"],control["rounds"][0]["actions"]))
                    sequence=[[a["action"] for a in t["actions"]] for t in r["rounds"]]
                    original=[[a["action"] for a in t["actions"]] for t in control["rounds"]]
                    pairs.append({"delta":r["metrics"]["unsafe_rate"]-control["metrics"]["unsafe_rate"],"first":first/2,"changed":sequence!=original})
                rows.append({"risk":risk,"mapping":mapping,"skin":skin,"pairs":len(pairs),"unsafe_delta":sum(p["delta"] for p in pairs)/len(pairs) if pairs else None,"first_flip":sum(p["first"] for p in pairs)/len(pairs) if pairs else None,"sequence_changed":sum(p["changed"] for p in pairs)/len(pairs) if pairs else None})
    return rows


def position_bands(records):
    counts=defaultdict(lambda:[0,0,set()])
    for r in records:
        if r.get("admission_status")!="admitted" or r["research"]["module"] not in ("multiplayer","multiplayer-persona"): continue
        condition=r["research"]["condition"]
        band="Baseline" if condition=="canonical" else ["Low","Mid","High"][(int(condition.split("-")[1])-1)//2]
        progress={p["player_id"]:0 for p in r["players"]}
        for rnd in r["rounds"]:
            for a in rnd["actions"]:
                p=progress[a["player_id"]]
                rank="Leader" if p==max(progress.values()) else "Trailer" if all(p<other for pid,other in progress.items() if pid!=a["player_id"]) else "Middle"
                cell=counts[(r["research"]["model"],band,rank)]
                cell[0]+=a["action"]=="UNSAFE"; cell[1]+=1; cell[2].add(r["game_id"])
            progress={p["player_id"]:p["progress"] for p in rnd["state_after"]}
    return [{"model":model,"band":band,"position":rank,"unsafe":u/total,"decisions":total,"races":len(races)} for (model,band,rank),(u,total,races) in sorted(counts.items())]


def validate_opaque_mappings(records,replays,calls_dir):
    """Independently verify raw P/Q codes against every admitted decoded action."""
    checked=0
    def decoded(trace,mapping):
        value=json.loads(trace["response_content"])["action"]
        if value not in ("P","Q"): raise ValueError("Admitted opaque output used an invalid response code")
        return "SAFE" if value==mapping else "UNSAFE"
    for r in records:
        j=r["research"]
        if r.get("admission_status")!="admitted" or not j["condition"].startswith("opaque:"): continue
        calls=json.loads((calls_dir/(j["id"]+".json")).read_text(encoding="utf-8"))
        final={(c["phase"],c["player_id"]):c for c in calls}
        mapping=j["condition"].split(":")[-1]
        for rnd in r["rounds"]:
            for action in rnd["actions"]:
                if decoded(final[(f"paper_round_{rnd['index']}_action",action["player_id"])],mapping)!=action["action"]:
                    raise ValueError("Opaque mapping differs from recorded action")
                checked+=1
    for r in replays:
        if not r.get("readable"): continue
        stem=hashlib.sha256(r["job"].encode()).hexdigest()[:16]
        calls=json.loads((calls_dir/(stem+".json")).read_text(encoding="utf-8"))
        if decoded(calls[-1],r["mapping"])!=r["action"]:
            raise ValueError("Fixed-state mapping differs from recorded action")
        checked+=1
    return {"checked_decisions":checked,"invalid_codes":0,"mismatched_actions":0,"gate":"raw final P/Q output must decode to the recorded SAFE/UNSAFE action"}


def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--out",type=Path,default=Path("../docs/results/reproduction-20261005")); args=parser.parse_args(); out=args.out
    public=Path("../frontend/public/research"); public.mkdir(parents=True,exist_ok=True)
    records=[json.loads(p.read_text(encoding="utf-8")) for p in sorted((out/"races").glob("*.json"))]
    audits=[json.loads(p.read_text(encoding="utf-8")) for p in sorted((out/"audit").glob("*.json"))]
    replays=[json.loads(p.read_text(encoding="utf-8")) for p in sorted((out/"replays").glob("*.json"))]
    manifest=json.loads((out/"manifest.json").read_text(encoding="utf-8")); account=CampaignLedger(out/"ledger.json",manifest["limit_usd"]); account.checkpoint(); ledger=account.entries
    supplement_path=out/"supplement-manifest.json"
    supplement=json.loads(supplement_path.read_text(encoding="utf-8")) if supplement_path.exists() else None
    cells=[]
    for module in sorted({r["research"]["module"] for r in records}):
        subset=[r for r in records if r["research"]["module"]==module]
        for c in research_summary(subset):
            c["module"]=module
            matched=[r for r in subset if r.get("admission_status")=="admitted" and r["players"][0]["model"]==c["model"] and r["risk_treatment"]==c["risk"] and len(r["players"])==c["players"] and r["research"]["condition"]==c["condition"]]
            ps=[p for r in matched for p in r["metrics"]["players"]]
            c["decision_pooled_unsafe"]=sum(p["unsafe_count"] for p in ps)/sum(p["rounds_played"] for p in ps)
            cells.append(c)
    audit_cells=[]
    for audit in audits:
        bycategory=defaultdict(list)
        for row in audit["rows"]: bycategory[row["category"]].append(row)
        for cat,rows in bycategory.items():
            audit_cells.append({"model":audit["model"],"variant":audit["variant"],"category":cat,"outputs":len(rows),"completed":sum(r["status"]=="completed" for r in rows),"correct":sum(r["correct"] for r in rows),"strict":sum(r["strict"] for r in rows)})
    paired=[]
    for risk in (.1,.6,.9):
        relevant=[r for r in records if r["research"]["module"]=="arithmetic" and r["research"]["risk"]==risk]
        pairs=[]
        for seed in sorted(set(r["seed"] for r in relevant if r.get("admission_status"))):
            pair=[r for r in relevant if r.get("seed")==seed and r.get("admission_status")=="admitted"]
            if len(pair)==2:
                bycond={r["research"]["condition"]:r for r in pair}; a=bycond["canonical"]; b=bycond["card"]
                pairs.append({"seed":seed,"horizon":a["realized_horizon"],"canonical":a["metrics"]["unsafe_rate"],"card":b["metrics"]["unsafe_rate"],"first_round_flips":sum(x["action"]!=y["action"] for x,y in zip(a["rounds"][0]["actions"],b["rounds"][0]["actions"]))})
        paired.append({"risk":risk,"pairs":pairs})
    rows=trajectories(records)
    report={"schema":"paper-results-v1","manifest":manifest,"data_hash":hashlib.sha256(json.dumps(records,sort_keys=True).encode()).hexdigest(),"cells":cells,"audit":audit_cells,"paired":paired,"positions":positions(records),"replays":replays,"published2p":PUBLISHED_2P,"publishedFirst5":PUBLISHED_FIRST5,"publishedN":PUBLISHED_N,"total":len(records),"admitted":sum(r.get("admission_status")=="admitted" for r in records),"excluded":sum(r.get("admission_status")=="excluded-contaminated" for r in records),"failed":sum(r.get("status")=="failed" for r in records),"spent_usd":sum(e["charged_usd"] for e in ledger),"uncertain_usd":sum(e["charged_usd"] for e in ledger if "upper-bound" in e["accounting"]),"provider_attempts":len(ledger),"successful_calls":sum(e.get("status_code")==200 for e in ledger),"contributions":[{"id":r.get("game_id",r["research"]["id"]),"model":r["research"]["model"],"module":r["research"]["module"],"condition":r["research"]["condition"],"players":r["research"]["players"],"risk":r["research"]["risk"],"seed":str(r["research"]["seed"]),"repetition":r["research"]["repetition"],"status":r.get("admission_status",r.get("status")),"error":r.get("error"),"cost_usd":sum(e["charged_usd"] for e in ledger if e.get("job")==r["research"]["id"]),"contributor":r["contributor"]} for r in records]}
    for contribution,record in zip(report["contributions"],records):
        contribution["scope"]=record["research"].get("scope")
        contribution["replaces_failed_cell"]=record["research"].get("replaces_failed_cell")
    report["supplement"]=supplement
    catalog=json.loads((out/"catalog.json").read_text(encoding="utf-8"))
    report["roster"]=[{"model":model,"repetitions_per_risk":reps,"scope":scope,"prompt_usd_million":float(catalog[model]["pricing"]["prompt"])*1e6,"completion_usd_million":float(catalog[model]["pricing"]["completion"])*1e6} for model,reps,scope in ROSTER]
    report["context"]=context_comparisons(records)
    report["position_bands"]=position_bands(records)
    report["publishedPositions"]=PUBLISHED_POSITION
    report["opaque_mapping_validation"]=validate_opaque_mappings(records,replays,out/"calls")
    draw_charts(report,rows,public)
    import importlib.metadata
    report["analysis_packages"]={package:importlib.metadata.version(package) for package in ("numpy","matplotlib","scikit-learn","shap","statsmodels")}
    report["engine_git_base"]=subprocess.check_output(["git","merge-base","HEAD","origin/main"],text=True).strip()
    write_json(out/"report.json",report)
    write_json(Path("../frontend/public/data/research.json"),report)
    write_json(public/"trajectories.json",rows)
    with zipfile.ZipFile(public/"reproduction-20261005.zip","w",zipfile.ZIP_DEFLATED) as archive:
        for p in sorted(out.rglob("*.json")): archive.write(p,p.relative_to(out))
        for p in sorted(out.glob("*.jsonl")): archive.write(p,p.relative_to(out))
        archive.write(Path(__file__),"code/export_research.py")
        archive.write(Path("tools/reproduce_paper.py"),"code/reproduce_paper.py")
        archive.write(Path("moloch/research.py"),"code/research.py")
        archive.write(Path("tools/research_supplement.py"),"code/research_supplement.py")
        archive.write(Path("requirements.txt"),"code/requirements.txt")
        archive.write(Path("tools/research-requirements.txt"),"code/research-requirements.txt")
        archive.write(Path("../frontend/public/data/historical-provider-calls.json"),"history/provider-calls.json")
        for source in Path("moloch").rglob("*.py"):
            archive.write(source,Path("code/backend")/source)
    # Export only new game files; preserve the existing archive and snapshot.
    conn=db.connect()
    try:
        # The checked-in archive can contain historical races absent from local SQLite.
        # Import their original records so the fallback leaderboard retains that history.
        for path in Path("../frontend/public/data/games").glob("*.json"):
            original=json.loads(path.read_text(encoding="utf-8"))
            db.save_game(conn,original,contributor=original.get("contributor"))
        history=json.loads(Path("../frontend/public/data/historical-provider-calls.json").read_text(encoding="utf-8"))
        for game_id,calls in history.items():
            if not conn.execute("SELECT 1 FROM provider_calls WHERE game_id = ? LIMIT 1",(game_id,)).fetchone():
                db.save_provider_calls(conn,game_id,calls)
        for r in records:
            if r.get("admission_status"):
                db.save_game(conn,r,contributor=r.get("contributor"))
                write_json(Path("../frontend/public/data/games")/(r["game_id"]+".json"),r)
        # Compact provider metadata seeds the live leaderboard after deployment.
        # Full prompts/responses remain available together in the downloadable ZIP.
        provider_calls={}
        keys=("player_id","model","phase","usage","response_id","provider","served_model","finish_reason","reasoning_mode","attempt","max_tokens","latency_ms","status_code","error")
        for r in records:
            if r.get("admission_status"):
                raw=json.loads((out/"calls"/(r["research"]["id"]+".json")).read_text(encoding="utf-8"))
                provider_calls[r["game_id"]]=[{key:call[key] for key in keys if key in call} for call in raw]
                if not conn.execute("SELECT 1 FROM provider_calls WHERE game_id = ? LIMIT 1",(r["game_id"],)).fetchone():
                    db.save_provider_calls(conn,r["game_id"],provider_calls[r["game_id"]])
        write_json(Path("../frontend/public/data/research-provider-calls.json"),provider_calls)
        write_json(Path("../frontend/public/data/leaderboard.json"),{"summary":db.paper_summary(conn),"paper_models":db.paper_leaderboard(conn),"paper_backends":db.paper_backend_leaderboard(conn),"contributors":db.list_contributions(conn,limit=10000)})
    finally: conn.close()
    print(f"Exported {report['total']} races, {len(rows)} analysis rows; ${report['spent_usd']:.6f}")


def draw_charts(report, rows, public):
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.cluster import HDBSCAN
    from sklearn.manifold import TSNE
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import GroupShuffleSplit
    from sklearn.metrics import roc_auc_score, balanced_accuracy_score
    import shap
    plt.rcParams.update({"font.size":9,"axes.spines.top":False,"axes.spines.right":False,"svg.fonttype":"none"})
    cells=[c for c in report["cells"] if c["module"]=="baseline" and c["condition"]=="canonical" and c["players"]==2]
    models=sorted(set(c["model"] for c in cells))
    colors=plt.cm.tab20(np.linspace(0,1,len(models)))
    def save(fig,name):
        fig.savefig(public/(name+".svg"),bbox_inches="tight",facecolor="white"); plt.close(fig)
    # Figure 3 equivalent: literal first five rounds, player-level means.
    fig,ax=plt.subplots(figsize=(10,5)); x=np.arange(len(models))
    observed=[]; refs=[]
    for m in models:
        ts=[t["unsafe"] for t in rows if t["kind"]=="trajectory" and t["model"]==m]
        observed.append(np.mean(ts)); refs.append(PUBLISHED_FIRST5.get(m,np.nan))
    ax.bar(x-.18,observed,.36,label="Arena: rounds 1–5"); ax.bar(x+.18,refs,.36,label="Paper Fig. 3 (rounded)",color="#aeb5bd")
    ax.axhline(.56,color="#8b5cf6",linestyle="--",label="Published human mean (56%)")
    ax.set(ylim=(0,1.05),ylabel="Player-level mean UNSAFE",xticks=x,xticklabels=[short(m) for m in models]); ax.tick_params(axis="x",rotation=40); ax.legend(); save(fig,"first-five")
    # Table 12 risk curves; same unit, no inferred missing values.
    fig,axs=plt.subplots(3,4,figsize=(12,9),sharex=True,sharey=True)
    for ax,m in zip(axs.flat,models):
        cs=sorted([c for c in cells if c["model"]==m],key=lambda c:c["risk"])
        ax.errorbar([c["risk"] for c in cs],[c["unsafe"] for c in cs],yerr=[[c["unsafe"]-c["ci95"][0] for c in cs],[c["ci95"][1]-c["unsafe"] for c in cs]],label="Arena",marker="o",capsize=3)
        if m in PUBLISHED_2P: ax.plot([.1,.6,.9],PUBLISHED_2P[m],"s--",label="Paper Table 12")
        ax.plot([.1,.6,.9],[.992,.980,.019],":",color="#b0b0b0",label="Published EGT")
        ax.set(title=short(m),ylim=(-.03,1.03),xticks=[.1,.6,.9]); ax.grid(alpha=.2)
    for ax in list(axs.flat)[len(models):]: ax.set_visible(False)
    from matplotlib.lines import Line2D
    fig.legend(handles=[Line2D([0],[0],color="#1f77b4",marker="o",label="Arena · race bootstrap CI95"),Line2D([0],[0],color="#ff7f0e",marker="s",linestyle="--",label="Paper Table 12"),Line2D([0],[0],color="#b0b0b0",linestyle=":",label="Published EGT")],loc="upper center",ncol=3,fontsize=8)
    fig.supxlabel("Maximum private risk"); fig.supylabel("Player-level mean UNSAFE (race bootstrap CI95)"); fig.tight_layout(rect=(0,0,1,.96)); save(fig,"risk-curves")
    fig,axs=plt.subplots(len(models),3,figsize=(10,len(models)*1.5),sharex=True,sharey=True)
    for i,m in enumerate(models):
        for j,risk in enumerate((.1,.6,.9)):
            c=next((c for c in cells if c["model"]==m and c["risk"]==risk),None)
            if c: axs[i,j].hist(c["rates"],bins=np.linspace(0,1,11),weights=np.ones(len(c["rates"]))/len(c["rates"]),color=colors[i],edgecolor="white")
            if j==0: axs[i,j].set_ylabel(short(m),fontsize=7)
            if i==0: axs[i,j].set_title(f"Risk {risk:.0%}")
    fig.supxlabel("Player UNSAFE rate (full race); empirical 10-point bins, no smoothing"); fig.supylabel("Share of trajectories in each bin (linear scale)"); fig.tight_layout(); save(fig,"distributions")
    families={"Claude":[m for m in models if m.startswith("anthropic/")],"OpenAI":[m for m in models if m.startswith("openai/")],"Gemini":[m for m in models if "gemini" in m],"Economic extensions / audit checkpoint":[m for m in models if not m.startswith(("anthropic/","openai/")) and "gemini" not in m]}
    fig,axs=plt.subplots(4,3,figsize=(12,12),sharex=True,sharey=True)
    grid=np.linspace(0,1,1001); bandwidth=.025
    for i,(family,members) in enumerate(families.items()):
        for j,risk in enumerate((.1,.6,.9)):
            ax=axs[i,j]
            for m in members:
                c=next((c for c in cells if c["model"]==m and c["risk"]==risk),None)
                if not c: continue
                rates=np.array(c["rates"])
                kernel=lambda v:np.exp(-.5*(v/bandwidth)**2)/(bandwidth*np.sqrt(2*np.pi))
                density=(kernel(grid[:,None]-rates)+kernel(grid[:,None]+rates)+kernel(grid[:,None]-(2-rates))).mean(axis=1)
                integral=(getattr(np,"trapezoid",None) or np.trapz)(density,grid)
                density/=integral
                ax.plot(grid*100,10*density,label=f"{short(m)} (n={len(rates)})",color=colors[models.index(m)])
            ax.set(yscale="log",ylim=(.1,1000),xlim=(0,100),xticks=[0,20,40,60,80,100]); ax.grid(alpha=.15)
            ax.legend(fontsize=6,loc="upper right")
            if i==0: ax.set_title(f"Maximum risk {risk:.0%}")
            if j==0: ax.set_ylabel(family,fontsize=8)
    report["density"]={"method":"Gaussian KDE reflected at 0 and 1, normalised on [0,1]","bandwidth":bandwidth,"grid_points":1001,"scale":"density × 10 = percent per 10-point rate interval; logarithmic y-axis","author_bandwidth":"unavailable","human_data":"not imported"}
    fig.supxlabel("Player UNSAFE rate (%)"); fig.supylabel("Smoothed density (% per 10-point interval; log scale)")
    fig.suptitle("Fig. 8 technique: overlapping risk distributions by checkpoint family; local smoothing settings")
    fig.tight_layout(); save(fig,"distribution-density")
    ts=[t for t in rows if t["kind"]=="trajectory"]
    X=np.array([t["features"] for t in ts]); y=np.array([t["unsafe"] for t in ts])
    report["embedding"]={"trajectories":len(ts),"features":"own1..5, opponent1..5, gap1..5; unscaled raw features","human_data":"not imported: no joint human/LLM embedding or human-fit archetype claim"}
    if len(ts)>30:
        clusters=HDBSCAN(min_cluster_size=15,min_samples=7,cluster_selection_method="eom",copy=True).fit_predict(X)
        # Adopt the contrib min_samples=6 convention; author implementation is unknown.
        literal=HDBSCAN(min_cluster_size=15,min_samples=6,cluster_selection_method="eom",copy=True).fit_predict(X)
        from sklearn.metrics import adjusted_rand_score
        coords=TSNE(n_components=2,perplexity=min(30,len(ts)-1),random_state=20261005,init="pca",learning_rate="auto").fit_transform(X)
        report["embedding"].update({"seed":20261005,"perplexity":min(30,len(ts)-1),"hdbscan_min_cluster_size":15,"hdbscan_min_samples_sklearn":7,"hdbscan_min_samples_contrib_equivalent":6,"clusters":len(set(clusters)-{-1}),"unclustered":int(sum(clusters==-1))})
        report["embedding"]["sensitivity"]={"author_implementation":"unpublished","literal_sklearn_min_samples6_clusters":len(set(literal)-{-1}),"literal_sklearn_min_samples6_unclustered":int(sum(literal==-1)),"adjusted_rand_6_vs_7":float(adjusted_rand_score(clusters,literal)),"convention_source":"https://scikit-learn.org/stable/modules/generated/sklearn.cluster.HDBSCAN.html"}
        fig,axs=plt.subplots(1,3,figsize=(13,4))
        for i,m in enumerate(models):
            mask=np.array([t["model"]==m for t in ts]); axs[0].scatter(coords[mask,0],coords[mask,1],s=14,color=colors[i],label=short(m),alpha=.7)
        axs[0].legend(fontsize=6,loc="upper left",bbox_to_anchor=(0,-.1),ncol=2); axs[0].set_title("Population (Fig. 5 equivalent)")
        for group in sorted(set(clusters)):
            mask=clusters==group
            axs[1].scatter(coords[mask,0],coords[mask,1],color="#aaa" if group==-1 else plt.cm.tab20(int(group)%20),s=14,label="Unassigned" if group==-1 else f"C{group}")
        axs[1].legend(fontsize=6,loc="upper left",bbox_to_anchor=(0,-.1),ncol=3); axs[1].set_title("HDBSCAN groups (Fig. 4 equivalent)")
        dots=axs[2].scatter(coords[:,0],coords[:,1],c=y,cmap="RdYlGn_r",vmin=0,vmax=1,s=14); fig.colorbar(dots,ax=axs[2],label="UNSAFE rounds 1–5"); axs[2].set_title("Same coordinates (Fig. 6 equivalent)")
        for ax in axs: ax.set(xticks=[],yticks=[])
        save(fig,"embeddings")
        fig,axs=plt.subplots(3,4,figsize=(12,8))
        for ax,m,color in zip(axs.flat,models,colors):
            mask=np.array([t["model"]==m for t in ts])
            ax.scatter(coords[:,0],coords[:,1],s=8,color="#ddd",alpha=.45)
            ax.scatter(coords[mask,0],coords[mask,1],s=16,color=color,alpha=.8)
            ax.set(title=f"{short(m)} (n={sum(mask)})",xticks=[],yticks=[])
        for ax in list(axs.flat)[len(models):]: ax.set_visible(False)
        fig.suptitle("Fig. 5 technique: each population in the same locally fitted t-SNE space")
        fig.tight_layout(); save(fig,"population-panels")
        cluster_ids=sorted(set(clusters))
        shares=np.array([[sum(clusters[np.array([t['model']==m for t in ts])]==k)/sum(t['model']==m for t in ts) for k in cluster_ids] for m in models])
        fig,ax=plt.subplots(figsize=(max(8,len(cluster_ids)*.6),5))
        im=ax.imshow(shares,cmap="Blues",vmin=0,vmax=1,aspect="auto")
        ax.set(yticks=range(len(models)),yticklabels=[short(m) for m in models],xticks=range(len(cluster_ids)),xticklabels=["Unassigned" if k==-1 else f"C{k}" for k in cluster_ids],title="Local HDBSCAN composition (rows sum to 100%)")
        for i in range(len(models)):
            for j in range(len(cluster_ids)):
                ax.text(j,i,f"{shares[i,j]:.0%}",ha="center",va="center",fontsize=7,color="white" if shares[i,j]>.6 else "black")
        fig.colorbar(im,ax=ax); save(fig,"clusters")
        write_json(public/"embedding.json",[{**t,"x":float(c[0]),"y":float(c[1]),"cluster":int(k)} for t,c,k in zip(ts,coords,clusters)])
    fig,axs=plt.subplots(3,4,figsize=(12,9),subplot_kw={"projection":"polar"})
    labels=[f"Own{t}" for t in range(1,6)]+[f"Opp{t}" for t in range(1,6)]+[f"Gap{t}" for t in range(2,6)]
    angles=np.linspace(0,2*np.pi,14,endpoint=False); angles=np.r_[angles,angles[0]]
    def profile(data):
        mean=np.mean(data,axis=0); return np.r_[mean[:10],(mean[11:]+2)/4]
    pooled=profile(X)
    for ax,m,color in zip(axs.flat,models,colors):
        value=profile([t["features"] for t in ts if t["model"]==m]); ax.plot(angles,np.r_[value,value[0]],color=color); ax.plot(angles,np.r_[pooled,pooled[0]],":",color="grey"); ax.set(xticks=angles[:-1],xticklabels=labels,ylim=(0,1),title=short(m)); ax.tick_params(labelsize=6)
    for ax in list(axs.flat)[len(models):]: ax.set_visible(False)
    fig.suptitle("Fig. 7 equivalent: raw mean profile; gaps mapped from [-2,2] to [0,1]"); fig.tight_layout(); save(fig,"profiles")
    drivers=[]
    for m in models:
        data=[r for r in rows if r["kind"]=="decision" and r["model"]==m]
        Xd=np.array([r["features"] for r in data]); yd=np.array([r["unsafe"] for r in data]); groups=np.array([r["race"] for r in data])
        result={"model":m,"races":len(set(groups)),"decisions":len(data),"status":"insufficient-race-variation"}
        if len(set(groups))>=10 and len(set(yd))==2:
            train,test=next(GroupShuffleSplit(n_splits=1,test_size=.25,random_state=20261005).split(Xd,yd,groups))
            if len(set(yd[train]))==2 and len(set(yd[test]))==2:
                rf=RandomForestClassifier(n_estimators=200,max_depth=5,class_weight="balanced",random_state=20261005).fit(Xd[train],yd[train])
                pred=rf.predict_proba(Xd[test])[:,1]
                vals=np.asarray(shap.TreeExplainer(rf).shap_values(Xd[test]))
                if vals.ndim==3: vals=vals[:,:,1]
                magnitudes=np.abs(vals).mean(axis=0); shares=magnitudes/magnitudes.sum() if magnitudes.sum() else magnitudes
                result.update({"status":"exploratory","shares":shares.tolist(),"auc":roc_auc_score(yd[test],pred),"balanced_accuracy":balanced_accuracy_score(yd[test],pred>=.5),"train_races":len(set(groups[train])),"test_races":len(set(groups[test]))})
        drivers.append(result)
    report["drivers"]=drivers
    # Same trajectory-classification family as the paper, with race-grouped folds.
    from sklearn.tree import DecisionTreeClassifier
    from sklearn.model_selection import StratifiedGroupKFold, cross_val_score
    identities=np.array([t["model"] for t in ts]); race_groups=np.array([t["race"] for t in ts])
    folds=StratifiedGroupKFold(n_splits=5,shuffle=True,random_state=20261005)
    tree=DecisionTreeClassifier(max_depth=4,class_weight="balanced",random_state=20261005)
    if len(set(race_groups))>=10:
        scores=cross_val_score(tree,X,identities,groups=race_groups,cv=folds,scoring="accuracy")
        report["identity_tree"]={"folds":5,"max_depth":4,"split":"stratified-by-population, grouped-by-race","accuracy":float(scores.mean()),"sd":float(scores.std()),"populations":len(models),"majority_baseline":max(sum(identities==m) for m in models)/len(ts),"human_included":False}
    # Risk-only, checkpoint-only, checkpoint × risk, restricted to Table 12's roster.
    # No independent-decision p-value: this pilot is dependent within races.
    import pandas as pd
    import statsmodels.api as sm
    import statsmodels.formula.api as smf
    import warnings
    binary=[]
    for r in rows:
        if r["kind"]=="decision" and r["model"] in PUBLISHED_2P:
            binary.append({"unsafe":r["unsafe"],"checkpoint":r["model"],"risk":str(r["features"][3]),"race":r["race"]})
    # Include round one as well for the baseline outcome-frequency fits.
    for t in ts:
        if t["model"] in PUBLISHED_2P:
            race=next(c for c in report["contributions"] if c["id"]==t["race"])
            binary.append({"unsafe":t["features"][0],"checkpoint":t["model"],"risk":str(race["risk"]),"race":t["race"]})
    frame=pd.DataFrame(binary); logistic=[]
    for name,formula in [("risk-only","unsafe ~ C(risk)"),("checkpoint-only","unsafe ~ C(checkpoint)"),("checkpoint-by-risk","unsafe ~ C(checkpoint)*C(risk)")]:
        try:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                fit=smf.glm(formula,frame,family=sm.families.Binomial()).fit(maxiter=150)
            logistic.append({"model":name,"deviance":float(fit.deviance),"aic":float(fit.aic),"parameters":int(fit.df_model+1),"converged":bool(fit.converged),"unstable":bool(max(abs(fit.params))>15 or any("separation" in str(w.message).lower() for w in caught)),"warnings":sorted(set(str(w.message) for w in caught)),"outputs":len(frame),"races":int(frame.race.nunique())})
        except Exception as exc: logistic.append({"model":name,"status":"not-estimable","error":type(exc).__name__})
    report["logistic"]=logistic
    valid=[d for d in drivers if d["status"]=="exploratory"]
    fig,ax=plt.subplots(figsize=(10,5)); features=["Own previous","Opponent previous","Progress gap","Risk","Round"]
    if valid:
        mat=np.array([d["shares"] for d in valid]); im=ax.imshow(mat,vmin=0,vmax=1,cmap="Blues",aspect="auto"); ax.set(xticks=range(5),xticklabels=features,yticks=range(len(valid)),yticklabels=[short(d["model"]) for d in valid])
        for i in range(len(valid)):
            for j in range(5): ax.text(j,i,f"{mat[i,j]:.0%}",ha="center",va="center",color="white" if mat[i,j]>.6 else "black")
        fig.colorbar(im,ax=ax)
    else: ax.text(.5,.5,"No model meets the split/class variation gate",ha="center")
    ax.set_title("Fig. 11 equivalent: TreeSHAP on held-out races; exploratory associations")
    save(fig,"drivers")
    fig,axs=plt.subplots(1,2,figsize=(10,4),sharey=True)
    for ax,m in zip(axs,PUBLISHED_N):
        values=[]
        for n in (3,4,5):
            cs=[c for c in report["cells"] if c["model"]==m and c["players"]==n and c["condition"]=="canonical"]
            values.append(sum(c["decision_pooled_unsafe"]*c["decisions"] for c in cs)/sum(c["decisions"] for c in cs) if cs else np.nan)
        ax.plot([3,4,5],values,"o-",label="Arena decision-pooled"); ax.plot([3,4,5],PUBLISHED_N[m],"s--",label="Paper Table 13 (decision-pooled)"); ax.set(title=short(m),xticks=[3,4,5],ylim=(0,1),xlabel="Players"); ax.legend(fontsize=7)
    save(fig,"multiplayer")
    fig,axs=plt.subplots(2,4,figsize=(13,7),sharey=True)
    for i,m in enumerate(PUBLISHED_N):
        for j,band in enumerate(("Baseline","Low","Mid","High")):
            ax=axs[i,j]; ranks=("Leader","Middle","Trailer")
            cs=[next((c for c in report["position_bands"] if c["model"]==m and c["band"]==band and c["position"]==rank),None) for rank in ranks]
            ax.plot(range(3),[c["unsafe"] if c else np.nan for c in cs],"o-",label="Arena")
            ax.plot(range(3),PUBLISHED_POSITION[m][band],"s--",color="grey",label="Paper Tables 5/6")
            ax.set(xticks=range(3),xticklabels=ranks,ylim=(0,1.08),title=f"{short(m)} · {band}")
            for x,c in enumerate(cs):
                if c: ax.annotate(f"n={c['decisions']}"+(" †" if c['decisions']<20 else ""),(x,c["unsafe"]),xytext=(0,8),textcoords="offset points",ha="left" if x==0 else "right" if x==2 else "center",fontsize=7)
            if m=="openai/gpt-5.4-nano" and band in ("Low","High"):
                for x,n in ([(2,9)] if band=="Low" else [(1,4),(2,18)]):
                    ax.annotate(f"paper n={n} †",(x,PUBLISHED_POSITION[m][band][x]),xytext=(0,16 if band=="Low" else -15),textcoords="offset points",ha="right" if x==2 else "center",fontsize=6,color="grey")
            if i==0 and j==0: ax.legend(fontsize=8)
    fig.suptitle("Fig. 9 comparison: pre-action rank; N=3–5 and all private risks pooled; reconstructed personas")
    fig.tight_layout(); save(fig,"position-bands")
    fig,axs=plt.subplots(1,2,figsize=(10,4),sharey=True)
    paired=report["paired"]
    for condition,label,marker in (("canonical","Canonical","o"),("card","Arithmetic card","s")):
        values=[np.mean([p[condition] for p in row["pairs"]]) if row["pairs"] else np.nan for row in paired]
        axs[0].plot([row["risk"] for row in paired],values,marker+"-",label=label)
    axs[0].set(title="Matched local Qwen races",xlabel="Private risk",xticks=[.1,.6,.9],ylim=(0,1),ylabel="Mean player UNSAFE"); axs[0].legend()
    all_pairs=[p for row in paired for p in row["pairs"]]
    local=[np.mean([p[c] for p in all_pairs]) if all_pairs else np.nan for c in ("canonical","card")]
    axs[1].bar(np.arange(2)-.18,local,width=.36,label=f"Local ({len(all_pairs)} pairs)")
    axs[1].bar(np.arange(2)+.18,[.52,.608],width=.36,color="grey",label="Paper Table 3 (30 pairs)")
    axs[1].set(title="Aggregate arithmetic diagnostic",xticks=[0,1],xticklabels=["Canonical","Card"],ylim=(0,1)); axs[1].legend(fontsize=8)
    save(fig,"arithmetic")
    from moloch.research import SKINS
    fig,axs=plt.subplots(1,2,figsize=(12,5),sharey=True)
    for ax,mapping in zip(axs,("P","Q")):
        matrix=np.array([[next((c["unsafe_delta"] for c in report["context"] if c["skin"]==skin and c["mapping"]==mapping and c["risk"]==risk),None) for risk in (.1,.6,.9)] for skin in SKINS if skin!="abstract"],dtype=float)
        im=ax.imshow(matrix,vmin=-1,vmax=1,cmap="RdBu_r",aspect="auto")
        ax.set(xticks=range(3),xticklabels=["10%","60%","90%"],yticks=range(7),yticklabels=[s for s in SKINS if s!="abstract"],title=f"SAFE code {mapping}",xlabel="Private risk")
        for i in range(7):
            for j in range(3): ax.text(j,i,"No pair" if np.isnan(matrix[i,j]) else f"{matrix[i,j]*100:+.1f} pp",ha="center",va="center",fontsize=8)
    fig.colorbar(im,ax=axs.ravel().tolist(),label="UNSAFE difference versus matched abstract control")
    fig.suptitle("Live context diagnostic: two paired repeats per cell; reconstructed narratives")
    save(fig,"live-context")
    fig,ax=plt.subplots(figsize=(8,4))
    for risk,color in zip((.1,.6,.9),("#199e70","#c98500","#e66767")):
        cs=sorted([c for c in report["cells"] if c["module"]=="persona" and c["risk"]==risk],key=lambda c:int(c["condition"].split("-")[1]))
        ax.plot([int(c["condition"].split("-")[1]) for c in cs],[c["unsafe"] for c in cs],"o-",color=color,label=f"Mechanical risk {risk:.0%}")
    ax.set(xticks=range(1,7),ylim=(0,1),xlabel="Assigned Qwen risk-persona level (reconstructed wording)",ylabel="Player mean UNSAFE",title="Fig. 10 technique: assigned persona crossed with mechanical risk")
    ax.legend(); save(fig,"personas")
    fig,ax=plt.subplots(figsize=(9,5))
    categories=("rules","stage","state","transition","terminal","expected")
    for model,color in zip(models,colors):
        cats=[next((a for a in report["audit"] if a["model"]==model and a["variant"]=="direct" and a["category"]==cat),None) for cat in categories]
        ax.plot(range(6),[a["correct"]/a["outputs"] if a else np.nan for a in cats],"o-",label=short(model),color=color)
    ax.plot(range(6),[.974,1,.37,.222,.533,.167],"k--",label="Published Qwen task audit (685 outputs)")
    ax.set(xticks=range(6),xticklabels=categories,ylim=(0,1.05),ylabel="Semantic correctness",title="Reconstructed 41-item task audit versus published category rates")
    ax.legend(fontsize=7,bbox_to_anchor=(1.02,1)); save(fig,"task-validity")

if __name__=="__main__": main()
