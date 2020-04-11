const fs   = require('fs');
const util = require('util');
const bent = require('bent');
const Parser = require('rss-parser');

const getStaff = async () => {
	let staff;
	try {
		staff = JSON.parse(fs.readFileSync('staff.json', { encoding: 'utf8' }));
		return staff;
	} catch (e) {
	}

	staff = {};

	let parser = new Parser();
	let feed   = await parser.parseURL('https://www.edx.org/api/v2/report/course-feed/rss');
	let links  = feed.items.map(i => i.link);

	try {
		let i = 0;
		for (let link of links) {
			console.log(`Fetching ${++i}/${links.length}...\n\t${link}`);
			let res = await bent(link, 200, 301)();
			if (res.statusCode === 200) {
				console.log('\tNo instructors');
				continue;
			}
			res = await bent('https://www.edx.org/page-data/course/' + res.headers.location.substr(26) + '/page-data.json', 'json')();
			res.result.pageContext.course.activeCourseRuns.map(r => r.staff).flat().forEach(s => staff[s.uuid] = s);
		}
	} catch (e) {
		console.error(e);
	}

	fs.writeFileSync('staff.json', JSON.stringify(staff, null, '\t') + '\n');

	return staff;
};

(async () => {
	let staff = Object.values(await getStaff());

	console.log(staff.length, 'staff');

	let rows = staff.map(s => [
			`=IMAGE("${s.profileImageUrl}")`,
			s.givenName,
			s.familyName,
			`=HYPERLINK("https://www.edx.org/bio/${s.slug}","EdX bio")`,
			s.position ? s.position.title: '',
			s.position ? s.position.organizationName: ''
		]);

	let header = [
		'Photo',
		'Forename',
		'Surname',
		'EdX bio',
		'Title',
		'Organisation'
	];
	rows.unshift(header);

	const { google } = require('googleapis');
	let auth = await require('./sheets.js')();

	const sheets = google.sheets({ version: 'v4', auth });

	try {
		await sheets.spreadsheets.values.update({
			spreadsheetId: '1g1vhaVcMLFZhNgNq9eWDVxlPLpRQRnCJp7uVU02MoZU',
			range: "'EdX Instructors'!1:300",
			valueInputOption: 'USER_ENTERED',
			resource: {
				majorDimension: 'ROWS',
				values: rows
			}
		});
	} catch (e) {
		console.log('The API returned an error:', e);
		return;
	}
})();
