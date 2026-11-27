import assert from 'node:assert/strict'
import { visits, incidents, items, assignments } from '../src/data/data.ts'
import { analyticsPeriods, countReportBuckets, createReportBuckets, inReportPeriod, isReportDate, reportInterval, resolveAnalyticsRange } from '../src/features/reporting/reporting.ts'

const september=resolveAnalyticsRange('Calendar Month','2026-09-15')
assert.deepEqual(september,{from:'2026-09-01',to:'2026-09-30'})
const inRange=(rows,range)=>rows.filter(row=>row.date>=range.from&&row.date<=range.to)
assert.deepEqual([inRange(visits,september).filter(v=>v.outcome==='Entered').length,inRange(incidents,september).length,inRange(items,september).length,inRange(assignments,september).length],[245,12,24,15])
assert.equal(inRange(items,september).filter(i=>i.type==='Lost').length,11)
assert.equal(inRange(items,september).filter(i=>i.type==='Found').length,13)

assert.deepEqual(resolveAnalyticsRange('Last 7 Days','2027-01-03'),{from:'2026-12-28',to:'2027-01-03'})
assert.deepEqual(resolveAnalyticsRange('Last 30 Days','2026-10-19'),{from:'2026-09-20',to:'2026-10-19'})
assert.deepEqual(resolveAnalyticsRange('Calendar Month','2028-02-15'),{from:'2028-02-01',to:'2028-02-29'})
assert.deepEqual(resolveAnalyticsRange('Calendar Year','2026-09-30'),{from:'2026-01-01',to:'2026-12-31'})
assert.equal(resolveAnalyticsRange('Custom','2026-09-01','2026-09-02'),null)
assert.equal(resolveAnalyticsRange('Custom','2026-09-30',''),null)
assert.equal(resolveAnalyticsRange('Selected Day',''),null)
assert.equal(isReportDate('2026-02-29'),false)
assert.equal(isReportDate('2028-02-29'),true)
assert.equal(isReportDate('2026-13-01'),false)

const buckets=createReportBuckets(september,'Calendar Month')
assert.equal(buckets.length,30)
assert.equal(buckets[0].from,'2026-09-01')
assert.equal(buckets.at(-1).to,'2026-09-30')
assert.deepEqual(countReportBuckets([{date:'2026-09-02'},{date:'2026-10-01'}],buckets),[0,1,...Array(28).fill(0)])

// Every preset must preserve filtered source counts, including zero intervals.
for(const anchor of ['2026-09-30','2026-10-19']){
  for(const period of analyticsPeriods){
    const range=resolveAnalyticsRange(period,anchor,'2026-08-10')
    const selectedBuckets=createReportBuckets(range,period)
    for(const rows of [visits.filter(v=>v.outcome==='Entered'),items]){
      const counts=countReportBuckets(rows,selectedBuckets)
      assert.equal(counts.reduce((sum,count)=>sum+count,0),inRange(rows,range).length,`${period} chart agrees with source counts`)
    }
    assert.equal(selectedBuckets[0].from,range.from)
    assert.equal(selectedBuckets.at(-1).to,range.to)
  }
}
const hourly=createReportBuckets({from:'2026-10-19',to:'2026-10-19'},'Selected Day')
assert.equal(hourly.length,24)
const hours=countReportBuckets([{date:'2026-10-19',time:'00:00'},{date:'2026-10-19',time:'23:59'},{date:'2026-10-20',time:'00:00'}],hourly)
assert.equal(hours[0],1)
assert.equal(hours[23],1)
assert.equal(hours.reduce((sum,count)=>sum+count,0),2)

const weeklyRange={from:'2026-12-15',to:'2027-01-17'}
const weekly=createReportBuckets(weeklyRange,'Custom')
assert.equal(reportInterval(weeklyRange,'Custom'),'week')
assert.equal(weekly.length,5)
assert.equal(weekly.at(-1).from,'2027-01-12')
assert.equal(weekly.at(-1).to,'2027-01-17')
const monthly=createReportBuckets({from:'2026-09-15',to:'2027-04-03'},'Custom')
assert.equal(monthly.length,8)
assert.equal(monthly[0].to,'2026-09-30')
assert.equal(monthly.at(-1).from,'2027-04-01')
assert.equal(monthly.at(-1).to,'2027-04-03')
assert.match(monthly[0].detail,/partial month/)
assert.match(monthly.at(-1).label,/\*$/)
assert.doesNotMatch(monthly[1].detail,/partial/)
for(const [to,interval] of [['2026-01-31','day'],['2026-02-01','week'],['2026-06-29','week'],['2026-06-30','month']]){
  assert.equal(reportInterval({from:'2026-01-01',to},'Custom'),interval)
}

// Existing report aliases and inclusive boundaries retain their behavior.
for(const period of ['Month','Monthly'])assert.equal(inReportPeriod('2026-09-30',period,'2026-09-15'),true)
for(const period of ['Year','Yearly'])assert.equal(inReportPeriod('2026-12-31',period,'2026-09-15'),true)
for(const timezone of ['Asia/Manila','America/Los_Angeles','Pacific/Auckland']){
  process.env.TZ=timezone
  for(const period of ['Week','Weekly']){
    assert.equal(inReportPeriod('2026-10-13',period,'2026-10-19'),true)
    assert.equal(inReportPeriod('2026-10-12',period,'2026-10-19'),false)
  }
  assert.deepEqual(resolveAnalyticsRange('Last 7 Days','2026-03-09'),{from:'2026-03-03',to:'2026-03-09'})
}
console.log('PASS: analytics fixture totals, all presets, timezone-independent date boundaries, leap years, hourly/daily/weekly/monthly buckets, partial intervals, zero filling, and report compatibility.')
