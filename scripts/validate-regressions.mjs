import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROGRAM_PLANS } from '../app/program-plans.ts';
import { calculateCreditSummary, designationLookupKey, coursesShareIdentity, getPlanCourseCounts, getCourseRoleEligibility, getCourseDesignation } from '../app/credit-model.ts';
import { calculateProgramGaps, evaluateSpecialRules, courseOpportunity, getProgramChecks } from '../app/program-rules.ts';
import { generateRecommendationPlans, schedulesConflict } from '../app/recommendation-engine.ts';
import { mergeCourseRows, reconcileCourseUpdate } from '../app/course-data.ts';

const optical = PROGRAM_PLANS.find((p) => p.id === 'optical-master');
const ai = PROGRAM_PLANS.find((p) => p.id === 'ai-master');
const autumn = JSON.parse(fs.readFileSync('app/courses.json', 'utf8'));
const spring = JSON.parse(fs.readFileSync('app/courses-spring.json', 'utf8'));
const schedule = (day = 0, weeks = [1,2]) => [{dayIndex: day, start: 1, end: 3, weeks}];
const base = {plan: optical, selectedCourses: [], designations: {}, historicalRecords: [], exemptionStatus: 'normal', termLabel: '2027 春季'};
const core = {id: 'core-01', name: '高等光学原理', code: '280216085408P2001-01', category: '专业核心课', subject: '光电信息工程', credits: 3, schedules: schedule(), scheduleStatus: 'confirmed'};
const core02 = {...core, id: 'core-02', code: '280216085408P2001-02', schedules: schedule(1)};
const degree = {[designationLookupKey(core)]: 'degree'};
assert.equal(getCourseDesignation(core,{},optical),'degree');
assert.equal(getCourseDesignation(core,{[designationLookupKey(core)]:'unset'},optical),'unset');
assert.equal(getCourseDesignation(core,{[designationLookupKey(core)]:'non-degree'},optical),'non-degree');
const historyOf = (course, designation = 'degree') => ({
  id: 'h-' + course.id, courseName: course.name, courseCode: course.code, category: course.category,
  subject: course.subject, credits: course.credits, designation, module: 'regular', term: '2026秋季', courseCount: 1,
});
assert.equal(getPlanCourseCounts({courses: [core,core02], plan: optical, designations: degree, historicalRecords: []}).coreCount, 1);
assert.equal(calculateCreditSummary({...base, selectedCourses: [core,core02], designations: degree}).estimatedCredits,3);
assert.equal(getPlanCourseCounts({courses: [core02], plan: optical, designations: degree, historicalRecords: [historyOf(core)]}).coreCount,1);
assert.equal(calculateCreditSummary({...base, selectedCourses: [core02], historicalRecords: [historyOf(core)], designations: degree}).estimatedCredits,3);
assert.equal(coursesShareIdentity(core, {...core, code: '280216085408P2999'}),false);
assert.equal(coursesShareIdentity({...core, canonicalCourseId:'stable-optical'}, {...core02,code:'280216085408P2999',canonicalCourseId:'stable-optical'}),true);

const english = spring.find((c) => c.name === '硕士学位英语');
assert.equal(calculateCreditSummary({...base, selectedCourses:[english], exemptionStatus:'approved'}).estimatedCredits,3);
assert.equal(calculateCreditSummary({...base, selectedCourses:[english], exemptionStatus:'normal'}).estimatedCredits,3);
const oldEnglish = {...english, id:'old-eng', name:'英语A', code:'280216050200MB001-01'};
const engHistory = [historyOf(oldEnglish),historyOf(english)];
assert.equal(calculateCreditSummary({...base, selectedCourses:[english], historicalRecords:engHistory, exemptionStatus:'approved'}).estimatedCredits,3);
assert.equal(calculateProgramGaps({...base, selectedCourses:[english], exemptionStatus:'approved'}).semesterCredits,0);
const exemptContext={...base,selectedCourses:[{...core,credits:7},english],exemptionStatus:'approved'};
const exemptGaps=calculateProgramGaps(exemptContext);
assert.equal(getProgramChecks({...exemptContext,gaps:exemptGaps,termId:'2027-spring',conflictCount:0}).find((check)=>check.id==='semester-minimum').severity,'verification');
assert.equal(calculateCreditSummary({...base, selectedCourses: [spring.find((c) => c.name === '博士学位英语')]}).estimatedCredits,0);
assert.equal(calculateCreditSummary({...base, historicalRecords: [historyOf(spring.find((c) => c.name === '博士学位英语'))]}).estimatedCredits,0);

assert.equal(mergeCourseRows([core,core02]).length,2);
const planned = {...core,id:'planned-core',code:'SP2027-999',officialCode:null, scheduleStatus:'planned',dataStatus:'planned_course',schedules:[]};
const legacyFormal = {...core,scheduleStatus:undefined,dataStatus:undefined};
assert.equal(mergeCourseRows([planned,legacyFormal])[0].scheduleStatus,'confirmed');
assert.equal(mergeCourseRows([planned,core,core02]).length,2);
assert.equal(mergeCourseRows([core,planned])[0].id,core.id);
assert.deepEqual(reconcileCourseUpdate([core],[planned],[core.id],degree).selectedIds,[core.id]);
const migrated = reconcileCourseUpdate([planned],[core,core02],[planned.id],{[designationLookupKey(planned)]:'degree'});
assert.equal(migrated.courses.length,2);
assert.equal(migrated.selectedIds.length,1);
assert.equal(migrated.sectionChoices.length,1);
assert.equal(migrated.designations[designationLookupKey(core)],'degree');
assert.deepEqual(reconcileCourseUpdate([core],[core02], [core.id],degree).selectedIds,[core02.id]);
assert.ok(reconcileCourseUpdate([core],[],[core.id],degree).courses.some((c) => c.id===core.id));

assert.equal(schedulesConflict(core,{...core02,schedules:schedule(0,[8,9])}),false);
assert.equal(schedulesConflict(core,{...core02,schedules:schedule(0,[2,3])}),true);
assert.equal(schedulesConflict({...planned,schedules:schedule()},core),false);
const recommend = (overrides) => generateRecommendationPlans({...base,courses:[],...overrides});
const sectionResult = recommend({selectedCourses:[{...core,id:'lock',name:'固定课程',code:'280216085408P3999'}],courses:[core,core02]});
assert.ok(sectionResult[0].addedCourses.some((c) => c.id===core02.id));
assert.ok(sectionResult.every((p) => p.addedCourses.length===1));
assert.ok(recommend({selectedCourses:[core,{...core02,id:'different',name:'另一门',code:'280216085408P3888',schedules:schedule()}]})[0].conflicts>0);
assert.ok(recommend({courses:[core],historicalRecords:[historyOf(core)]}).every((p) => !p.addedCourses.length));
const cumulative = recommend({selectedCourses:[],programCourses:[core],designations:degree,courses:[core02]});
assert.equal(cumulative[0].gaps.coreCount,1);
assert.equal(cumulative[0].gaps.semesterCredits,0);
assert.equal(cumulative[0].addedCourses.length,0);

const ethics = {...core,id:'ethics',name:'工程伦理',code:'280216010100MB088',category:'公共必修课',credits:1,schedules:schedule(2)};
assert.equal(getCourseRoleEligibility(ethics,optical).status,'ineligible');
assert.equal(recommend({courses:[ethics]})[0].candidates[0].designation,'non-degree');
assert.equal(recommend({courses:[ethics]})[0].gaps.publicRequiredNonDegreeCredits,1);
const sport = {...ethics,id:'sport1',name:'体育一',subject:'体育学',code:'280216010100MX010',category:'公共选修课'};
assert.ok(recommend({courses:[sport,{...sport,id:'sport2',name:'体育二',code:'280216010100MX011',schedules:schedule(4)}]}).every((p) => p.addedCourses.length<=1));

// Once minimum semester credits are reached, do not keep scoring graduation gaps.
const ownCores = autumn.filter((c) => optical.coreCourses.includes(c.name)).map((c,i) => ({...c,schedules:schedule(i),scheduleStatus:'confirmed'}));
const locked = {...ownCores[0],credits:8};
const dynamic = recommend({selectedCourses:[locked],programCourses:[locked],designations:{[designationLookupKey(locked)]:'degree'},courses:ownCores.slice(1)});
assert.equal(dynamic[0].gaps.coreCount,2);
assert.equal(dynamic[0].addedCourses.length,1);
assert.equal(new Set(dynamic.map((p) => p.addedCourses.map((c) => c.id).sort().join('|'))).size,dynamic.length);

const nlp={...core,name:'自然语言处理'};
const math={...core,id:'math',name:'人工智能的数学基础与应用',code:'280216085410P2002',credits:2};
const aiDes={[designationLookupKey(nlp)]:'degree',[designationLookupKey(math)]:'degree'};
assert.equal(evaluateSpecialRules({plan:ai,selectedCourses:[nlp,math],designations:aiDes,historicalRecords:[]})[0].satisfied,true);
assert.equal(evaluateSpecialRules({plan:{...ai,code:'unknown',program:'unknown'},selectedCourses:[nlp],designations:aiDes,historicalRecords:[]})[0].satisfied,false);
assert.equal(evaluateSpecialRules({plan:ai,selectedCourses:[{...nlp,code:'280216085410P3001',category:'专业课'}],designations:{'family:280216085410P3001':'degree'},historicalRecords:[]})[0].satisfied,false);
assert.deepEqual(evaluateSpecialRules({plan:{...optical,specialRules:undefined},selectedCourses:[],designations:{},historicalRecords:[]}),[]);
assert.equal(courseOpportunity({name:'FPGA电路软硬件设计'}),'both');
assert.equal(courseOpportunity({name:'高等光学原理'}),'fall_only');
assert.equal(courseOpportunity({name:'自然语言处理'}),'unknown');
assert.ok(getProgramChecks({...base, selectedCourses:[ethics], designations:{[designationLookupKey(ethics)]:'degree'}, gaps:calculateProgramGaps(base), termId:'2027-spring', conflictCount:0}).some((check)=>check.id==='illegal-degree-designation'));
assert.equal(calculateProgramGaps({...base,selectedCourses:[spring[0]],futureCourses:[spring[0]],plan:PROGRAM_PLANS[0],designations:{[designationLookupKey(spring[0])]:'degree'}}).springOpportunity.core,0);
const phd=PROGRAM_PLANS.find((p)=>p.id==='physical-doctor');
assert.equal(phd.publicRequiredDegreeCredits,5);
assert.equal(phd.totalCredits,null);
const masterPublic = autumn.filter((c)=>/自然辩证法概论-01班|新时代中国特色社会主义理论与实践-01班|英语A-02班/.test(c.name));
assert.equal(masterPublic.length,3);
const phdSwitched = calculateCreditSummary({...base,plan:phd,selectedCourses:masterPublic});
assert.equal(phdSwitched.publicRequiredDegreeCredits,0);
assert.equal(phdSwitched.verificationDegreeCredits,0);
assert.equal(phdSwitched.estimatedCredits,6);
assert.ok(masterPublic.every((c)=>getCourseRoleEligibility(c,phd).status==='verification'));
assert.equal(calculateCreditSummary({...base,plan:phd,selectedCourses:masterPublic,exemptionStatus:'approved'}).estimatedCredits,6);
assert.equal(calculateCreditSummary({...base,plan:phd,historicalRecords:masterPublic.map((c)=>historyOf(c))}).publicRequiredDegreeCredits,0);
assert.equal(calculateCreditSummary({...base,plan:phd,selectedCourses:spring.filter((c)=>['博士学位英语','中国马克思主义与当代','学术道德与学术写作规范'].includes(c.name))}).publicRequiredDegreeCredits,5);
assert.equal(calculateProgramGaps({...base,plan:phd}).coreTarget,null);
assert.equal(PROGRAM_PLANS.find((p)=>p.studentTrack==='direct_phd').degreeCourseCredits,16);

const start=performance.now();
for (const plan of PROGRAM_PLANS.filter((p)=>p.studentTrack==='masters')) {
  const recommendations=generateRecommendationPlans({...base,plan,termLabel:'2026 秋季',termId:'2026-fall',courses:autumn,futureCourses:spring});
  assert.ok(recommendations.length<=3);
  for (const r of recommendations) {
    assert.equal(r.conflicts,0);
    assert.equal(new Set(r.addedCourses.map(designationLookupKey)).size,r.addedCourses.length);
    const applied = calculateProgramGaps({...base,plan,termLabel:'2026 秋季',selectedCourses:r.addedCourses,
      designations:Object.fromEntries(r.candidates.map((c)=>[designationLookupKey(c.course),c.designation]))});
    assert.equal(applied.professionalDegreeCreditsWithApproval,r.gaps.professionalDegreeCreditsWithApproval);
    assert.equal(applied.coreCount,r.gaps.coreCount);
  }
}
console.log('回归验证通过：身份/历史/英语/跨学期/班次导入/动态推荐/四专业真实158门数据。耗时 '+Math.round(performance.now()-start)+'ms');
