import path from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Capabilities, Options } from '@wdio/types'

import '../src/browser.js'

import {
    isSuccessfulResponse, getPrototype, getSessionError,
    startWebDriverSession, setupDirectConnect, validateCapabilities
} from '../src/utils.js'
import type { Client, RemoteConfig } from '../src/types.js'

vi.mock('@wdio/logger', () => import(path.join(process.cwd(), '__mocks__', '@wdio/logger')))
vi.mock('@wdio/utils')
vi.mock('fetch')

describe('utils', () => {
    it('isSuccessfulResponse', () => {
        expect(isSuccessfulResponse(200, { value: { some: 'result' } })).toBe(true)
        expect(isSuccessfulResponse(404, { value: { error: new Error('foobar' ) } })).toBe(false)
        expect(isSuccessfulResponse(404, { value: { error: 'no such element' } })).toBe(true)
        expect(isSuccessfulResponse(404, { value: {
            message: 'An element could not be located on the page using the given search parameters.' }
        })).toBe(true)
        expect(isSuccessfulResponse(200, { status: 7, value: {} })).toBe(false)
        expect(isSuccessfulResponse(undefined, { status: 7, value: {} })).toBe(false)
        expect(isSuccessfulResponse(undefined, { status: 0, value: {} })).toBe(true)
        expect(isSuccessfulResponse(
            undefined,
            { status: 7, value: { message: 'no such element: foobar' } }
        )).toBe(true)
        expect(isSuccessfulResponse(
            200,
            { value: { message: 'Unable to find element with xpath == //foobar' } }
        )).toBe(true)
    })

    it('getPrototype', () => {
        const isChromium = false
        const isMobile = false
        const isSauce = false
        const isIOS = false
        const isAndroid = false
        const isSeleniumStandalone = false

        const webdriverPrototype = getPrototype({
            isW3C: true, isChromium, isMobile, isSauce, isSeleniumStandalone, isIOS, isAndroid
        })
        expect(webdriverPrototype instanceof Object).toBe(true)
        expect(typeof webdriverPrototype.sendKeys).toBe('undefined')
        expect(typeof webdriverPrototype.sendCommand).toBe('undefined')
        expect(typeof webdriverPrototype.performActions.value).toBe('function')
        expect(typeof webdriverPrototype.lock).toBe('undefined')

        const chromiumPrototype = getPrototype({
            isW3C: false, isChromium: true, isMobile, isSauce, isSeleniumStandalone, isIOS, isAndroid
        })
        expect(chromiumPrototype instanceof Object).toBe(true)
        expect(typeof chromiumPrototype.sendCommand.value).toBe('function')
        expect(typeof chromiumPrototype.getElementValue.value).toBe('function')
        expect(typeof chromiumPrototype.elementSendKeys.value).toBe('function')
        expect(typeof chromiumPrototype.lock).toBe('undefined')

        const geckoPrototype = getPrototype({
            isW3C: true, isChromium: false, isFirefox: true, isMobile, isSauce, isSeleniumStandalone, isIOS, isAndroid
        })
        expect(geckoPrototype instanceof Object).toBe(true)
        expect(typeof geckoPrototype.setMozContext.value).toBe('function')
        expect(typeof geckoPrototype.installAddOn.value).toBe('function')
        expect(typeof geckoPrototype.elementSendKeys.value).toBe('function')
        expect(typeof geckoPrototype.lock).toBe('undefined')

        const mobilePrototype = getPrototype({
            isW3C: true, isChromium: false, isMobile: true, isSauce, isSeleniumStandalone, isIOS, isAndroid
        })
        expect(mobilePrototype instanceof Object).toBe(true)
        expect(typeof mobilePrototype.performActions.value).toBe('function')
        expect(typeof mobilePrototype.sendKeys.value).toBe('function')
        expect(typeof mobilePrototype.lock.value).toBe('function')
        expect(typeof mobilePrototype.getNetworkConnection.value).toBe('function')

        const mobileChromePrototype = getPrototype({
            isW3C: true, isChromium: true, isMobile: true, isSauce, isSeleniumStandalone, isIOS, isAndroid
        })
        expect(mobileChromePrototype instanceof Object).toBe(true)
        expect(typeof mobileChromePrototype.sendCommand.value).toBe('function')
        expect(typeof mobileChromePrototype.performActions.value).toBe('function')
        expect(typeof mobileChromePrototype.sendKeys.value).toBe('function')
        expect(typeof mobileChromePrototype.lock.value).toBe('function')
        expect(typeof mobileChromePrototype.getNetworkConnection.value).toBe('function')

        const saucePrototype = getPrototype({
            isW3C: true, isChromium, isMobile, isSauce: true, isSeleniumStandalone, isIOS, isAndroid
        })
        expect(saucePrototype instanceof Object).toBe(true)
        expect(typeof saucePrototype.getPageLogs.value).toBe('function')
    })

    describe('setupDirectConnect', () => {
        class TestClient implements Client {
            // @ts-expect-error
            sessionId?: string
            // @ts-expect-error
            requestedCapabilities?: WebdriverIO.Capabilities | Capabilities.W3CCapabilities

            constructor(
                public capabilities: WebdriverIO.Capabilities | Capabilities.W3CCapabilities,
                public options: Options.WebDriver
            ) {
                this.capabilities = capabilities
                this.options = options
            }
        }

        it('should do nothing if params contain no direct connect caps', function () {
            const client = new TestClient({ platformName: 'baz' }, { hostname: 'bar' } as any) as Client
            setupDirectConnect(client)
            expect(client.options.hostname).toEqual('bar')
        })

        it('should do nothing if params contain incomplete direct connect caps', function () {
            const client = new TestClient({ platformName: 'baz', 'appium:directConnectHost': 'baz' }, { hostname: 'bar' } as any) as Client
            setupDirectConnect(client)
            expect(client.options.hostname).toEqual('bar')
        })

        it('should update connection params if caps contain all direct connect fields', function () {
            const client = new TestClient({
                platformName: 'baz',
                'appium:directConnectProtocol': 'https',
                'appium:directConnectHost': 'bar',
                'appium:directConnectPort': 4321,
                'appium:directConnectPath': '/'
            }, {
                protocol: 'http',
                hostname: 'foo',
                port: 1234,
                path: ''
            } as any) as Client
            setupDirectConnect(client)
            expect(client.options.protocol).toBe('https')
            expect(client.options.hostname).toBe('bar')
            expect(client.options.port).toBe(4321)
            expect(client.options.path).toBe('/')
        })

        it('should update connection params even if path is empty string', function () {
            const client = new TestClient({
                platformName: 'baz',
                'appium:directConnectProtocol': 'https',
                'appium:directConnectHost': 'bar',
                'appium:directConnectPort': 4321,
                'appium:directConnectPath': ''
            }, {
                protocol: 'http',
                hostname: 'foo',
                port: 1234,
                path: ''
            } as any) as Client
            setupDirectConnect(client)
            expect(client.options.protocol).toBe('https')
            expect(client.options.hostname).toBe('bar')
            expect(client.options.port).toBe(4321)
            expect(client.options.path).toBe('')
        })
    })

    describe('getSessionError', () => {
        it('should return unchanged message', () => {
            expect(getSessionError({ message: 'foobar', name: 'Error' }, {})).toEqual('foobar')
        })

        it('should return "more info" if no message', () => {
            expect(getSessionError({ message: '', name: 'Error' }, {})).toEqual('See wdio.* logs for more information.')
        })

        it('should handle not properly set paths', () => {
            expect(getSessionError({ message: 'unhandled request', name: 'Error' }, {}))
                .toContain('Make sure you have set the "path" correctly!')
        })

        it('ECONNREFUSED', () => {
            expect(getSessionError({
                name: 'Some Error',
                code: 'ECONNREFUSED',
                message: 'ECONNREFUSED 127.0.0.1:4444'
            }, {
                protocol: 'https',
                hostname: 'foobar',
                port: 1234,
                path: '/foo/bar'
            })).toContain('Unable to connect to "https://foobar:1234/foo/bar"')
        })

        it('path: selenium-standalone path', () => {
            expect(
                getSessionError(
                    new Error('Whoops! The URL specified routes to this help page.'),
                    {}
                )
            ).toContain("set `path: '/wd/hub'` in")
        })

        it('path: chromedriver, geckodriver, etc', () => {
            expect(getSessionError(new Error('HTTP method not allowed'))).toContain("set `path: '/'` in")
        })

        it('edge driver localhost issue', () => {
            expect(
                getSessionError(new Error('Bad Request - Invalid Hostname 400 <br> HTTP Error 400'))
            ).toContain('127.0.0.1 instead of localhost')
        })

        it('illegal w3c cap passed to selenium standalone', () => {
            const message = getSessionError(
                new Error('Illegal key values seen in w3c capabilities: [chromeOptions]')
            )
            expect(message).toContain('[chromeOptions]')
            expect(message).toContain('add vendor prefix')
        })

        it('wrong host port, port in use, illegal w3c cap passed to grid', () => {
            const message = getSessionError(new Error('Response has empty body'))
            expect(message).toContain('valid hostname:port or the port is not in use')
            expect(message).toContain('add vendor prefix')
        })

        it('should hint for region issues for free-trial users', () => {
            const message = getSessionError(
                new Error('unknown error: failed serving request POST /wd/hub/session: Unauthorized'),
                { hostname: 'https://ondemand.eu-central-1.saucelabs.com' })
            expect(message).toContain('Ensure this region is set in your configuration')
        })
    })

    describe('startWebDriverSession', () => {
        const mockedFetch = vi.mocked(fetch)

        afterEach(() => {
            mockedFetch.mockClear()
        })

        it('attaches capabilities to the params object', async () => {
            const params: RemoteConfig = {
                hostname: 'localhost',
                port: 4444,
                path: '/',
                protocol: 'http',
                logLevel: 'warn',
                capabilities: {
                    browserName: 'chrome',
                    // @ts-expect-error test invalid cap
                    platform: 'Windows'
                }
            }
            const { sessionId, capabilities } = await startWebDriverSession(params)
            expect(sessionId).toBe('foobar-123')
            expect(capabilities.browserName)
                .toBe('mockBrowser')
            expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string).capabilities.alwaysMatch.webSocketUrl)
                .toBe(true)
        })

        it('should allow to opt-out from bidi', async () => {
            const params: RemoteConfig = {
                hostname: 'localhost',
                port: 4444,
                path: '/',
                protocol: 'http',
                capabilities: {
                    browserName: 'chrome',
                    'wdio:enforceWebDriverClassic': true
                }
            }
            await startWebDriverSession(params)
            expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string).capabilities.alwaysMatch.webSocketUrl)
                .toBe(undefined)
        })

        it('should not opt-in for Safari as it is not supported', async () => {
            const params: RemoteConfig = {
                hostname: 'localhost',
                port: 4444,
                path: '/',
                protocol: 'http',
                capabilities: {
                    browserName: 'safari'
                }
            }
            await startWebDriverSession(params)
            expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string).capabilities.alwaysMatch.webSocketUrl)
                .toBe(undefined)
        })

        it('should not opt-in for Safari as it is not supported', async () => {
            const params: RemoteConfig = {
                hostname: 'localhost',
                port: 4444,
                path: '/',
                protocol: 'http',
                capabilities: {
                    browserName: 'Safari'
                }
            }
            await startWebDriverSession(params)
            expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string).capabilities.alwaysMatch.webSocketUrl)
                .toBe(undefined)
        })

        it('should allow to opt-out from bidi when using alwaysMatch', async () => {
            const params: RemoteConfig = {
                hostname: 'localhost',
                port: 4444,
                path: '/',
                protocol: 'http',
                capabilities: {
                    alwaysMatch: {
                        browserName: 'chrome',
                        'wdio:enforceWebDriverClassic': true
                    },
                    firstMatch: []
                }
            }
            await startWebDriverSession(params)
            expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string).capabilities.alwaysMatch.webSocketUrl)
                .toBe(undefined)
        })

        it('should handle sessionRequest error', async () => {
            const error = await startWebDriverSession({
                logLevel: 'warn',
                capabilities: {}
            }).catch((err) => err)
            expect(error.message).toContain('Invalid URL')
        })

        it('should break if JSONWire and WebDriver caps are mixed together', async () => {
            const params: RemoteConfig = {
                hostname: 'localhost',
                port: 4444,
                path: '/',
                protocol: 'http',
                logLevel: 'warn',
                capabilities: {
                    browserName: 'chrome',
                    'sauce:options': {},
                    // @ts-expect-error test invalid cap
                    platform: 'Windows',
                    // @ts-ignore test invalid cap
                    foo: 'bar'
                }
            }
            const err: Error = await startWebDriverSession(params).catch((err) => err)
            expect(err.message).toContain(
                'Invalid or unsupported WebDriver capabilities found ' +
                '("platform", "foo").'
            )
        })
    })

    describe('validateCapabilities', () => {
        it('should throw an error if incognito is defined', () => {
            expect(() => {
                validateCapabilities({
                    browserName: 'chrome',
                    'goog:chromeOptions': {
                        args: ['--incognito']
                    }
                })
            }).toThrow('Please remove "incognito" from `"goog:chromeOptions".args`')
        })

        it('should throw an error if incognito is defined as string', () => {
            expect(() => {
                validateCapabilities({
                    browserName: 'chrome',
                    'goog:chromeOptions': {
                        args: ['incognito']
                    }
                })
            }).toThrow('Please remove "incognito" from `"goog:chromeOptions".args`')
        })

        it('should not throw an error if incognito is not defined', () => {
            expect(() => {
                validateCapabilities({
                    browserName: 'chrome'
                })
            }).not.toThrow()
        })
    })
})
