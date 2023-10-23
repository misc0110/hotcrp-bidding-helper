// ==UserScript==
// @name         HotCRP Bidding Stats
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Little helper for paper bidding
// @author       Michael Schwarz
// @match        https://*.hotcrp.com/*/reviewprefs*
// @match        https://*.hotcrp.com/reviewprefs*
// @icon         https://hotcrp.com/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
/* eslint-env jquery */

var all_abstracts = {};
var threshold;
var suggestions = [];
var suggest_current = -1;

function countBid() {
    var count = 0;
    var pcount = 0;
    var fields = $(".revpref");
    for(let f of fields) {
        if(f.value != "") {
            count++;
            if(f.value > 0) pcount++;
        }
    }
    return {"total": count, "positive": pcount, "all": fields.length};
}

function updateBid() {
    const c = countBid();
    $("#bidcnt").text(c.positive);
    $("#bidentered").text(c.total + " / " + c.all);
}

function disableConflicts() {
    var ccnt = 0;
    var conflicts = $("span.rti");
    for(let conflict of conflicts) {
        if(conflict.innerText == "C") {
            var top = $(conflict).parent().parent().parent();
            top.find(".revpref").prop("disabled", true);
            top.find(".pl_title").css("text-decoration", "line-through");
            ccnt++;
        }
    }
    return ccnt;
}

function applyNegative() {
    var fields = $(".revpref");
    for(let f of fields) {
        if(f.value == "") {
            var topic_score = parseInt($(f).parent().parent().find(".pl_topicscore").text());
            if(topic_score < 0) {
                console.log(topic_score);
                f.focus();
                f.click();
                f.value = topic_score;
                f.blur();
                $(f).trigger("change");
                $(f).trigger("fieldchange");
                $(f).trigger("input");
            }
        }
    }
}

function positiveTopicScores() {
    var cnt = 0;
    var fields = $(".pl_topicscore");
    for(let f of fields) {
        if(f.innerText != "" && parseInt(f.innerText) > 0) cnt++;
    }
    return cnt;
}

function updateKeywords() {
    var kws = $("#keyword_list").val().split(",");
    var nos = $("#nogo_list").val().split(",");
    var abstracts = $(".pl_abstract");
    GM_setValue("keywords", $("#keyword_list").val());
    GM_setValue("nogo", $("#nogo_list").val());
    threshold = parseInt($("#thresh").val());
    GM_setValue("threshold", threshold);
    var adjusted_topic_score = [];

    var kw_re = [];
    for(let kw of kws) {
        if(kw.trim().length > 0) {
            kw_re.push(new RegExp(kw.trim(), "ig"));
        }
    }
    var no_re = [];
    for(let n of nos) {
        if(n.trim().length > 0) {
            no_re.push(new RegExp(n.trim(), "ig"));
        }
    }
    var h = 0, hn = 0;

    for(let a of abstracts) {
        var h_c = false;
        var hn_c = false;
        var aid = $(a).parent().parent().attr("data-pid")
        var topic_score = parseInt($(a).parent().parent().prev("tr").find(".pl_topicscore").text());
        if(isNaN(topic_score)) topic_score = 0;
        var was_adjusted = false;
        var txt = all_abstracts[aid];
        for(var i = 0; i < kws.length; i++) {
            if(txt.match(kw_re[i])) {
                topic_score += 2;
                was_adjusted = true;
                if(!h_c) {
                    h_c = true;
                    h++;
                }
            }
            txt = txt.replace(kw_re[i], "<span style='background-color: yellow; font-weight: bold;'>$&</span>");
        }
        for(i = 0; i < nos.length; i++) {
            if(txt.match(nos[i])) {
                topic_score -= 5;
                was_adjusted = true;
                if(!hn_c) {
                    hn_c = true;
                    hn++;
                }
            }
            txt = txt.replace(no_re[i], "<span style='background-color: red; font-weight: bold; color: white;'>$&</span>");
        }
        if(was_adjusted) {
            a.innerHTML = txt;
        } else {
            topic_score -= 4;
        }
        adjusted_topic_score.push([aid, topic_score]);
    }

    $("#keyword_matches").text(h + " matched papers");
    $("#nogo_matches").text(hn + " matched papers");

    adjusted_topic_score.sort(function(first, second) { return second[1] - first[1]; });

    var interesting = "";
    suggestions = [];
    for(let sc of adjusted_topic_score) {
        if(sc[1] >= threshold) {
            interesting += "<a href='#p" + sc[0] + "' id='sunavid" + sc[0] + "'>#" + sc[0] + "</a> ";
            suggestions.push(sc[0]);
        } else break;
    }
    if(interesting == "") {
        $("#suggest_list").html("<i>No paper matches your keywords</i>");
    } else {
        $("#suggest_list").html(interesting);
        for(let s of suggestions) {
            $("#sunavid" + s).click(function(e) { gotoSuggest(s);});
        }
        $("#sugnav").show();
    }


}

function gotoSuggest(pid) {
    suggest_current = pid;
    $("#sugnavcur").text(pid);
    window.location.href = "#p" + pid;
}

function suggestNext() {
    var idx = suggestions.indexOf(suggest_current);
    if(idx < suggestions.length) {
        gotoSuggest(suggestions[idx + 1]);
    }
}

function suggestPrev() {
    var idx = suggestions.indexOf(suggest_current);
    if(idx > 0) {
        gotoSuggest(suggestions[idx - 1]);
    }
}


function saveAbstracts() {
    var abstracts = $(".pl_abstract");
    for(var i = 0; i < abstracts.length; i++) {
        all_abstracts[$(abstracts[i]).parent().parent().attr("data-pid")] = abstracts[i].innerHTML;
    }
}

function waitForAbstracts(cb) {
    if($(".pl_abstract").length > 0) {
        saveAbstracts();
        cb();
    }
    else setTimeout(function() { waitForAbstracts(cb); }, 100);
}

function enableSuggest() {
    $("#htctl1").click();
    waitForAbstracts(updateKeywords);
}

(function() {
    $("form#sel").prepend("<div>Bid on <span id='bidcnt'></span> (Bids entered: <span id='bidentered'></span>) &nbsp; &nbsp;" +
                          "Conflicts: <span id='conflictcnt'></span> &nbsp; &nbsp; " +
                          "Positive topic scores: <span id='posscores'></span> &nbsp; &nbsp; " +
                          "<button id='btnapplynegative'>Apply negative scores</button></div> &nbsp; &nbsp; <br />" +
                          "<table><tr><td>Highlight (comma-separated list):</td><td><input type='text' id='keyword_list' style='width: 95%'></td><td><span id='keyword_matches'></span></td></tr>" +
                          "<tr><td>Red flags (comma-separated list):</td><td><input type='text' id='nogo_list'  style='width: 95%'></td><td><span id='nogo_matches'></span></td></tr>" +
                          "<tr><td>Suggestions:</td><td colspan=2><span id='suggest_list'></span> (Threshold: <input type='number' id='thresh' />)</td></tr></table>");
    updateBid();
    $(".revpref").on("blur", updateBid);
    saveAbstracts();

    $("#keyword_list").on("blur", updateKeywords);
    $("#nogo_list").on("blur", updateKeywords);
    threshold = GM_getValue("threshold", 10);
    $("#thresh").val(threshold);
    $("#thresh").on("blur", updateKeywords);

    var kw = GM_getValue("keywords", "");
    if(kw != "") {
        $("#keyword_list").val(kw);
    }
    var nogos = GM_getValue("nogo", "");
    if(nogos != "") {
        $("#nogo_list").val(nogos);
    }
    if(nogos != "" || kw != "") updateKeywords();


    if(!$("#htctl1").is(":checked")) {
        $("#suggest_list").html("<button id='suggestenable'>Calculate</button>");
    }
    $("#suggestenable").on("click", enableSuggest);


    var conflicts = disableConflicts();
    $("#conflictcnt").text(conflicts);
    $("#btnapplynegative").click(function(e) {
        e.preventDefault();
        applyNegative();
    });
    $("#posscores").text(positiveTopicScores());
    $("body").append("<div id='sugnav' style='position: fixed; top: 0px; left: 0px; background-color: #fefefe; display: none;'><a id='sugnavprev'>&#129092;</a> <span id='sugnavcur' style='width: 8em;'>--</span> <a id='sugnavnext'>&#129094;</a></div>");
    $("#sugnavprev").click(suggestPrev);
    $("#sugnavnext").click(suggestNext);
})();
