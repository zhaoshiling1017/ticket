/*global SENTRY_DSN_PUBLIC */
import React from 'react'
import Raven from 'raven-js'
import { Route, IndexRoute, Redirect } from 'react-router'
import moment from 'moment'

import {requireAuth, requireCustomerServiceAuth} from'./common'
import App from './App'
import About from './About'
import Login from './Login'

import Tickets from './Tickets'
import NewTicket from './NewTicket'
import Ticket from './Ticket'
import Messages from './Messages'
import Notifications from './Notifications.js'
import CustomerService from './CustomerService'
import CSTickets from './CustomerServiceTickets'
import CSStats from './CustomerServiceStats'
import CSStatsUser from './CustomerServiceStats/User'
import User from './User'
import Home from './Home'

import Settings from './Settings'
import Profile from './settings/Profile'
import Organizations from './settings/Organizations'
import OrganizationNew from './settings/OrganizationNew'
import Organization from './settings/Organization'
import Tags from './settings/Tags'
import Tag from './settings/Tag'
import SettingsCSProfile from './settings/CustomerServiceProfile'
import Members from './settings/Members'
import FAQs from './settings/FAQs'
import FAQ from './settings/FAQ'
import Categories from './settings/Categories'
import Category from './settings/Category'
import CategorySort from './settings/CategorySort'
import Error from './Error'
import NotFound from './NotFound'
import {locale} from './i18n/I18nProvider'

if (locale === 'zh') {
  moment.updateLocale('zh-cn', {
    calendar : {
      lastWeek : function() {
        // eslint-disable-next-line i18n/no-chinese-character
        return this < moment().startOf('week') ? '[上]ddddLT' : 'ddddLT'
      },
    }
  })
}


if (SENTRY_DSN_PUBLIC !== '') {
  Raven.config(SENTRY_DSN_PUBLIC).install()
}

export default (
  <Route path="/" component={App}>
    <IndexRoute component={Home}/>
    <Route path="/about" component={About}/>
    <Route path="/login" component={Login}/>
    <Route path="/tickets" component={Tickets} onEnter={requireAuth} />
    <Route path="/tickets/new" component={NewTicket} onEnter={requireAuth} />
    <Route path="/tickets/:nid" component={Ticket} onEnter={requireAuth} />
    <Route path="/messages" component={Messages} onEnter={requireAuth} />
    <Route path="/notifications" component={Notifications} onEnter={requireAuth} />
    <Route path="/notifications/subscriptions" component={Notifications} onEnter={requireAuth} />
    <Route path="/customerService" component={CustomerService} onEnter={requireCustomerServiceAuth}>
      <Route path="/customerService/tickets" component={CSTickets} />
      <Route path="/customerService/stats" component={CSStats} />
      <Route path="/customerService/stats/users/:userId" component={CSStatsUser} />
    </Route>
    <Route path="/users/:username" component={User} onEnter={requireAuth} />
    <Route path="/settings" component={Settings} onEnter={requireAuth}>
      <Route path="/settings/profile" component={Profile} />
      <Route path="/settings/organizations" component={Organizations} />
      <Route path="/settings/organizations/new" component={OrganizationNew} />
      <Route path="/settings/organizations/:id" component={Organization} />
      <Route path="/settings/tags" component={Tags} />
      <Route path="/settings/tags/:id" component={Tag} />
      <Route path="/settings/customerServiceProfile" component={SettingsCSProfile} />
      <Route path="/settings/members" component={Members} />
      <Route path="/settings/faqs" component={FAQs} />
      <Route path="/settings/faqs/:id" component={FAQ} />
      <Route path="/settings/categories" component={Categories} />
      <Route path="/settings/categories/:id" component={Category} />
      <Route path="/settings/categorySort" component={CategorySort} />
    </Route>
    <Redirect from="/t/leancloud" to="/tickets" />
    <Redirect from="/t/leancloud/:nid" to="/tickets/:nid" />
    <Route path="/error" component={Error} />
    <Route path='*' component={NotFound} />
  </Route>
)
