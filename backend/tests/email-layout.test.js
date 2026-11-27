const { test } = require('node:test');
const assert = require('node:assert/strict');
const { emailLayout, detailPanel, noticeBox } = require('../src/lib/email-layout');

test('title, intro and footer are escaped so names and notes cannot inject markup', () => {
  const html = emailLayout({ title: '<img src=x>', intro: 'Dear <b>Ana</b> & team', footer: '"quoted"' });
  assert.ok(html.includes('&lt;img src=x&gt;'));
  assert.ok(html.includes('Dear &lt;b&gt;Ana&lt;/b&gt; &amp; team'));
  assert.ok(html.includes('&quot;quoted&quot;'));
  assert.ok(!html.includes('<img src=x>'));
});

test('the body is inserted as given, because callers escape their own values', () => {
  const html = emailLayout({ title: 'T', body: '<strong>kept</strong>' });
  assert.ok(html.includes('<strong>kept</strong>'));
});

test('detail rows and notices escape their text', () => {
  assert.ok(detailPanel([['Reference <x>', "O'Brien & Co"]]).includes('Reference &lt;x&gt;'));
  assert.ok(detailPanel([['Reference', "O'Brien & Co"]]).includes('O&#39;Brien &amp; Co'));
  assert.ok(noticeBox('<script>').includes('&lt;script&gt;'));
  assert.equal(detailPanel([]), '');
});
