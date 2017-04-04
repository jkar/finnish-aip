/* eslint-env mocha */
const fs = require('fs')
const path = require('path')
const chai = require('chai')
const chaiAsPromises = require('chai-as-promised')
const nock = require('nock')
const api = require('../index')
const persist = require('node-persist')

const should = chai.should()
chai.use(chaiAsPromises)

const TMP_DIR = path.join(__dirname, '../tmp/apitest')

describe('API must be initialized before use', () => {
  it('should fail if calling status without init', () =>
    api.status().should.eventually.be.rejected)

  it('should fail if calling current without init', () =>
    api.current().should.eventually.be.rejected)
})

describe('API init starts a sync and results are cached', () => {
  const expected = {
    aerodromes: [],
    prohibitedAreas: {
      features: [],
      type: 'FeatureCollection',
    },
    tma: {
      features: [],
      type: 'FeatureCollection',
    },
    cycle: '2010-06-23',
    validFrom: '2010-06-23T00:00:00.000Z',
    validUntil: undefined,
  }

  const cacheKey = expected.validFrom + expected.validUntil

  // fake the iso image being already downloaded and extracted
  before(() => {
    fs.mkdirSync(TMP_DIR)
    fs.mkdirSync(`${TMP_DIR}/2010-06-23`)

    nock.cleanAll()
  })

  after(() => {
    fs.rmdirSync(`${TMP_DIR}/2010-06-23`)
    fs.rmdirSync(TMP_DIR)
  })

  beforeEach(() => {
    nock('https://ais.fi')
      .get('/en/products-and-services/aip-iso-image')
      .reply(200, `
        <table><tr><td>
          <a href="/download_file/view/75">link1</a>
        </td><td>23 JUN 2010</td></tr><tr><td>
          <a href="/download_file/view/74">link2</a>
        </td><td>23 JUN 2010</td></tr></table>`)
  })

  const validateCurrent = () =>
    api.current().then(cached => {
      cached.should.deep.equal(expected)
    })

  const validateStatus = () =>
    api.status().then(status => {
      should.equal(status.cycle, expected.cycle)
      should.equal(status.validFrom, expected.validFrom)
      should.equal(status.validUntil, expected.validUntil)
      return status.files('*').should.eventually.deep.equal([])
    }).catch(err => {
      should.fail()
    })

  it('should sync on first init', () => {
    // make sure cache key is empty
    persist.removeItemSync(cacheKey)

    return api.init(TMP_DIR).then(result => {
      nock.isDone().should.equal(true)

      result.should.deep.equal(expected)

      // result was cached
      persist.getItemSync(cacheKey).should.deep.equal(expected)

      return validateCurrent().then(() => validateStatus())
    }).catch(err => {
      console.log(err)
      should.fail()
    })
  })

  it('should sync and use cached results', () =>
    api.init(TMP_DIR).then(result => {
      nock.isDone().should.equal(true)

      result.should.deep.equal(expected)

      return validateCurrent().then(() => validateStatus())
    })
  )
})
