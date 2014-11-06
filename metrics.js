#!/usr/local/bin/node
/*
curl -i https://api.github.com/orgs/intel-hadoop/members
curl -i https://api.github.com/orgs/intel-hadoop/teams
curl -i 'https://api.github.com/repos/intel-hadoop/gearpump/issues?since=2014-10-16&state=open'
curl -i 'https://api.github.com/repos/intel-hadoop/gearpump/commits?since=2014-10-16&until=2014-10-31'
curl -i 'https://api.github.com/repos/intel-hadoop/gearpump/pulls?state=closed&direction=asc'
curl -i https://api.github.com/repos/intel-hadoop/gearpump/stats/contributors
curl -i https://api.github.com/repos/intel-hadoop/gearpump/stats/participation
*/
function gitapi(user, password, uri, cb) {
  var request = require('request');
  var options = {
    url: 'https://api.github.com'+uri,
    auth: {
      'user': user,
      'pass': password
    },
    headers: {
        'User-Agent': 'request'
    }
  };
  function callback(error, response, body) {
    if (!error && (response.statusCode === 200 || response.statusCode === 202)) {
      var info = JSON.parse(body);
      cb(info);
    } else {
      console.log('uri='+uri+' statusCode='+response.statusCode+' error='+error);
    }
  }
  request(options, callback);
}

MetricsInput = (function() {
  function MetricsInput() {
    var self = this;
    this.charts = [];
    this.input = null;
    this.program = process.argv[1];
    this.teams = [];
    this.timeRanges = Array(2);
    this.generateGraph = this.generateGraph.bind(this);
    this.inputCallback = this.inputCallback.bind(this);
    this.usage = this.usage.bind(this);
    var options = process.argv.slice(2), user, password;
    options.map(function(arg,i) {
      switch(arg) {
        case "-h":
          self.usage();
          break;
        case "-u":
          user = options[i+1];
          break;
        case "-p":
          password = options[i+1];
          break;
        default:
          break;
      }
    });
    if(!user || !password) {
      this.usage();
    }
    gitapi = gitapi.bind(undefined, user, password);
    var input = (arguments.length > 4) ? process.argv[4] : 'input';
    var fs = require('fs');
    fs.readFile(input, 'utf8', this.inputCallback);
  }

  MetricsInput.prototype.generateGraph = function () {
    var self = this;
    this.timeRanges.forEach(function(timeRange,i) {
      var commits = {
        chart: {
          type:'pie'
        },
        title: {
          text: 'Summary for week of '+new Date(timeRange).toISOString()
        },
        xAxis: {
          type: 'category',
          showEmpty: false
        },
        yAxis: {
          showEmpty: false
        },
        legend: {
          showEmpty: false
        },
        plotOptions: {
            series: {
                borderWidth: 0,
                dataLabels: {
                    enabled: true
                }
            }
        },
        series: [{
            name: 'Commits',
            colorByPoint: true,
            data: [],
            type: 'column'
        }],
        drilldown: {
            series: []
        }
      };
      self.teams.forEach(function(team) {
        team.team.repos.forEach(function(repo) {
          var repoG = {};
          repoG.name = repo.name;
          repoG.y = repo.totals.commits;
          var id = repo.name+'_members';
          repoG.drilldown = id;
          commits.series[0].data.push(repoG);
          var repoM = {id: id, data: []};
          for(var member in repo.members) {
            repoM.data.push([member,repo.members[member].weeks[i].commits]);
          }
          commits.drilldown.series.push(repoM);
        });
      });
      self.charts.push(commits);
console.log(JSON.stringify(commits));
    });
  }

  MetricsInput.prototype.inputCallback = function (err, data) {
    var self = this;
    if(err) {
      throw err;
    }
    this.input = JSON.parse(data);
    this.input.forEach(function(team) {
      self.teams.push(new Metrics(self, team));
    });
    setTimeout(self.generateGraph, 10000);
  }

  MetricsInput.prototype.usage = function () {
    console.log("usage: "+this.program+' -u user -p password [input]');
    console.log("  -u: user");
    console.log("  -p: password");
    console.log("  input: input file");
    process.exit(0);
  }

  return MetricsInput;
})();

Metrics = (function() {
  function Metrics(metricsInput, team) {
    this.team = team;
    this.metricsInput = metricsInput;
    this.repoMap = {};
    this.timeRanges = Array(2);
    this.generateReport = this.generateReport.bind(this);
    this.issuesCallback = this.issuesCallback.bind(this);
    this.membersCallback = this.membersCallback.bind(this);
    this.pullRequestCallback = this.pullRequestCallback.bind(this);
    this.statsCallback = this.statsCallback.bind(this);
    this.teamCallback = this.teamCallback.bind(this);
    getTeam(this.team.name, this.teamCallback);
    return this;
  }

  Metrics.prototype.generateReport = function (repo) {
    console.log(this.team.name+'\n  '+repo.name)
    for(var member in repo.members) {
      console.log('    '+member);
      repo.members[member].weeks && repo.members[member].weeks.forEach(function(week) {
        console.log('      week of '+week.date.toDateString()+' commits:'+week.commits+' issues created:'+week.issuescreated+' pullrequests:'+week.pullrequests+' additions:'+week.additions+' deletions:'+week.deletions);
      });
    }
    console.log('  commits:'+repo.totals.commits+' issues created:'+repo.totals.issuescreated+' pullrequests:'+repo.totals.pullrequests+' additions:'+repo.totals.additions+' deletions:'+repo.totals.deletions+'\n');
  }

  Metrics.prototype.issuesCallback = function (repo, issues) {
    var self = this;
    issues.forEach(function(issue) {
      if(repo.members[issue.user.login]) {
        var created = new Date(issue.created_at)
        if(created.getTime() >= self.timeRanges[0] && created.getTime() < self.timeRanges[1]) {
          repo.members[issue.user.login].weeks[0].issuescreated++;
          repo.totals.issuescreated++;
        } else if(created.getTime() >= self.timeRanges[1]) {
          repo.members[issue.user.login].weeks[1].issuescreated++;
          repo.totals.issuescreated++;
        }
      }
    });
    this.generateReport(repo)
  }

  Metrics.prototype.membersCallback = function (membersArray) {
    var self = this;
    this.team.repos.forEach(function(repo) {
      self.repoMap[repo.name] = repo;
      repo.members = {};
      membersArray.forEach(function(member) {
        repo.members[member.login] = {}
        repo.members[member.login].weeks = [
            {date:new Date(),commits:0,issuescreated:0,pullrequests:0,additions:0,deletions:0},
            {date:new Date(),commits:0,issuescreated:0,pullrequests:0,additions:0,deletions:0}
        ]
      });
      getStats(repo.name+'/stats/contributors',self.statsCallback.bind(self,repo));
    });
  }

  Metrics.prototype.pullRequestCallback = function(repo, data) {
    var self = this;
    data.forEach(function(pull) {
      if(repo.members[pull.user.login]) {
        var created = new Date(pull.created_at)
        var closed = new Date(pull.closed_at)
        if(closed.getTime() >= self.timeRanges[0] && closed.getTime() < self.timeRanges[1]) {
          repo.members[pull.user.login].weeks[0].pullrequests++;
          repo.totals.pullrequests++;
        } else if(closed.getTime() >= self.timeRanges[1]) {
          repo.members[pull.user.login].weeks[1].pullrequests++;
          repo.totals.pullrequests++;
        }
      }
    });
    isNaN(this.timeRanges[0]) ||
    getIssues(repo.name, new Date(this.timeRanges[0]).toISOString(),this.issuesCallback.bind(this,repo));
  }

  Metrics.prototype.statsCallback = function(repo, stats) {
    var self = this, firsttime = true;
    repo.totals = {commits:0,issuescreated:0,pullrequests:0,additions:0,deletions:0};
    stats.forEach(function(stat) {
      var member = stat.author.login
      if(repo.members[member]) {
        var weeks = stat.weeks.slice(-2)
        weeks.forEach(function(aweek,i) {
          var time = parseInt(aweek.w+'000');
          if(firsttime) {
            self.timeRanges[i] = self.metricsInput.timeRanges[i] = time;
          }
          repo.members[member].weeks[i].date.setTime(time);
          repo.members[member].weeks[i].commits = parseInt(aweek.c);
          repo.members[member].weeks[i].additions = parseInt(aweek.a);
          repo.members[member].weeks[i].deletions = parseInt(aweek.d);
          repo.totals.commits += repo.members[member].weeks[i].commits;
          repo.totals.additions += repo.members[member].weeks[i].additions;
          repo.totals.deletions += repo.members[member].weeks[i].deletions;
        });
        firsttime = false;
      }
    });
    getPullRequests(repo.name,repo.branch,this.pullRequestCallback.bind(self,repo))
  }

  Metrics.prototype.teamCallback = function (team) {
    getMembers(team.id, this.membersCallback);
  }

  return Metrics;
})();

function getInput(repo, branch, path, inputcallback) {
  function callback(repo, branch, path, data) {
    var encoded = data.content;
    var content = new Buffer(encoded, 'base64').toString('ascii');
    inputcallback(content)
  }
  gitapi(repo+'/contents'+path+'?ref='+branch,callback.bind(undefined,repo,branch,path));
}

function getIssues(repo, since, issuescallback) {
  gitapi(repo+'/issues?'+since+'&state=open',issuescallback);
}

function getTeam(team, teamcallback) {
  function teamsCallback(name, teamcallback, teams) {
    teams.some(function(team) {
      if(team.name === name) {
        teamcallback(team);
        return true;
      }
      return false;
    })
  }
  gitapi('/orgs/intel-hadoop/teams',teamsCallback.bind(undefined,team,teamcallback));
}

function getStats(repo, statscallback) {
  gitapi(repo,statscallback);
}

function getPullRequests(repo, branch, pullrequestcallback) {
  function pullRequestsCallback(repo, pullrequestcallback, data) {
    pullrequestcallback(data)
  }
  gitapi(repo+'/pulls?state=closed&branch='+branch+'&direction=desc',pullRequestsCallback.bind(undefined,repo,pullrequestcallback));
}

function getMembers(teamid,memberscallback) {
  var uri = '/teams/'+teamid+'/members';
  gitapi(uri,memberscallback);
}
function getCommits(range,commitsCallback) {
  var uri = '/teams/'+teamid+'/members';
  gitapi(uri,memberscallback);
}

new MetricsInput()
